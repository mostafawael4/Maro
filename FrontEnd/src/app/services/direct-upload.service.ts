
import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { WebsocketService } from './websocket.service';

export interface UploadResult {
  ok: boolean;
  added: any[];
  duplicates?: any[];
  failed?: any[];
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DirectUploadService {

  constructor(
    private http: HttpClient,
    private websocketService: WebsocketService
  ) { }

  /**
   * Orchestrates the direct upload flow:
   * 1. Prepare (Get B2 URLs)
   * 2. Upload (Post to B2)
   * 3. Confirm (Verify and Save in Backend)
   */
  uploadFiles(
    prepareUrl: string,
    confirmUrl: string,
    files: File[],
    extraPrepareData: any = {},
    extraConfirmData: any = {}
  ): Observable<any> {
    return new Observable(observer => {
      // Ensure WebSocket is connected
      this.websocketService.connect();

      const fileInfos = files.map(f => ({ originalname: f.name, mimetype: f.type, size: f.size }));
      const prepareBody = { files: fileInfos, ...extraPrepareData };
      const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
      const uploadId = `upload-${Date.now()}`;

      // Track subscriptions for cleanup
      const subscriptions: any[] = [];
      let prepareSub: any = null;
      let processingSub: any = null;

      // Extract context from URL
      let context = 'gallery';
      if (confirmUrl.includes('orders')) context = 'order';
      else if (confirmUrl.includes('films')) context = 'film';
      else if (confirmUrl.includes('homepage')) context = 'homepage';
      const orderId = extraConfirmData.orderId;

      // Track all files being processed
      const allVerifiedFiles: any[] = [];
      const allFailedFiles: any[] = [];
      const pendingProcessingFiles = new Set<string>();
      let uploadedBytes = 0;
      let completedUploads = 0;
      const totalUploads = files.length;
      let allDuplicates: any[] = [];

      // Listen to processing status for ALL files
      processingSub = this.websocketService.onProcessingStatus().subscribe((status: any) => {
        if (status && status.context === context && pendingProcessingFiles.has(status.filename)) {
          if (status.status === 'completed' || status.status === 'failed') {
            pendingProcessingFiles.delete(status.filename);

            // Check if everything is done
            if (completedUploads === totalUploads && pendingProcessingFiles.size === 0) {
              finalizeObserver();
            }
          }
        }
      });

      // 1. Prepare
      prepareSub = this.http.post<any>(prepareUrl, prepareBody, { withCredentials: true }).subscribe({
        next: async (resp) => {
          if (!resp.ok && !resp.uploadSlots) {
            if (resp.duplicates && resp.duplicates.length > 0 && (!resp.uploadSlots || resp.uploadSlots.length === 0)) {
              observer.next(new HttpResponse({
                body: { ok: true, type: 'complete', added: [], duplicates: resp.duplicates }
              }));
              observer.complete();
              return;
            }
            observer.error(resp.error || resp.message || 'Prepare upload failed');
            return;
          }

          const { uploadSlots, duplicates, rejectedFiles } = resp;
          allDuplicates = duplicates || [];
          
          // Handle rejected files
          if (rejectedFiles && rejectedFiles.length > 0) {
            rejectedFiles.forEach((rf: any) => {
              allFailedFiles.push(rf);
              console.error(`File rejected: ${rf.originalName} - ${rf.reason}`);
            });
          }
          const duplicateCount = allDuplicates.length;

          // Add duplicates to our tracking
          if (duplicateCount > 0) {
            completedUploads += duplicateCount;
          }

          if (!uploadSlots || uploadSlots.length === 0) {
            observer.next(new HttpResponse({
              body: { ok: true, type: 'complete', added: [], duplicates: duplicates || [] }
            }));
            observer.complete();
            return;
          }

          // 2. Upload to B2 and process each file immediately
          for (let i = 0; i < uploadSlots.length; i++) {
            const slot = uploadSlots[i];
            const file = files.find(f => f.name === slot.originalName);
            if (!file) {
              completedUploads++;
              continue;
            }

            try {
              // Upload to B2
              const b2FileName = slot.key || slot.filename;
              await this.uploadToB2(slot.uploadUrl, slot.authorizationToken, b2FileName, file, (progress) => {
                const currentFileBytes = Math.round((progress / 100) * file.size);
                const totalLoadedBytes = uploadedBytes + currentFileBytes;

                observer.next({
                  type: HttpEventType.UploadProgress,
                  loaded: totalLoadedBytes,
                  total: totalBytes
                });

                this.websocketService.reportUploadProgress(uploadId, Math.round((totalLoadedBytes / totalBytes) * 100), 'upload');
              });

              uploadedBytes += file.size;

              const fileData = {
                filename: slot.filename,
                originalName: slot.originalName,
                mimetype: slot.mimetype,
                size: file.size,
                foldername: extraConfirmData.foldername || null,
                description: extraConfirmData.description || null
              };

              // 3. Immediately confirm THIS file
              const confirmBody = { uploadedFiles: [fileData], ...extraConfirmData };
              const confirmSub = this.http.post<any>(confirmUrl, confirmBody, { withCredentials: true }).subscribe({
                next: (confirmResp) => {
                  const verifiedFiles = confirmResp.verified || [];

                  if (verifiedFiles.length > 0) {
                    allVerifiedFiles.push(...verifiedFiles);

                    // Add to pending processing
                    verifiedFiles.forEach((f: any) => pendingProcessingFiles.add(f.filename));

                    // Trigger WebSocket processing for THIS file
                    this.websocketService.reportUploadComplete(
                      `${uploadId}-${fileData.filename}`,
                      context,
                      verifiedFiles,
                      { orderId }
                    );
                  } else {
                    allFailedFiles.push({ ...fileData, error: 'Verification failed' });
                  }

                  completedUploads++;

                  // Check if all uploads complete and processing done
                  if (completedUploads === totalUploads && pendingProcessingFiles.size === 0) {
                    finalizeObserver();
                  }
                },
                error: (err) => {
                  allFailedFiles.push({ ...fileData, error: err.message || 'Verification failed' });
                  this.websocketService.reportUploadFailure(`${uploadId}-${fileData.filename}`, 'upload', err.message);
                  completedUploads++;

                  if (completedUploads === totalUploads && pendingProcessingFiles.size === 0) {
                    finalizeObserver();
                  }
                }
              });

              subscriptions.push(confirmSub);

            } catch (err: any) {
              allFailedFiles.push({ originalName: file.name, reason: err.message || 'Upload failed' });
              this.websocketService.reportUploadFailure(`${uploadId}-${file.name}`, 'upload', err.message);
              completedUploads++;

              if (completedUploads === totalUploads && pendingProcessingFiles.size === 0) {
                finalizeObserver();
              }
            }
          }

          // Fallback timeout
          setTimeout(() => {
            if (!observer.closed && (completedUploads < totalUploads || pendingProcessingFiles.size > 0)) {
              console.warn('Processing timeout reached');
              finalizeObserver();
            }
          }, 120000);
        },
        error: (err) => observer.error(err)
      });

      function finalizeObserver() {
        if (processingSub) processingSub.unsubscribe();
        subscriptions.forEach(sub => sub?.unsubscribe());

        observer.next(new HttpResponse({
          body: {
            type: 'complete',
            ok: true,
            added: allVerifiedFiles,
            duplicates: allDuplicates,
            failed: allFailedFiles,
            message: `${allVerifiedFiles.length} file(s) processed successfully`
          }
        }));
        observer.complete();
      }

      // Teardown logic
      return () => {
        if (prepareSub) prepareSub.unsubscribe();
        if (processingSub) processingSub.unsubscribe();
        subscriptions.forEach(sub => sub?.unsubscribe());
      };
    });
  }

  private async uploadToB2(uploadUrl: string, token: string, fileName: string, file: File, onProgress: (p: number) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);

      xhr.setRequestHeader('Authorization', token);
      xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(fileName));
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify');

      // Set timeout for very large files (30 minutes)
      xhr.timeout = 30 * 60 * 1000;

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = (event.loaded / event.total) * 100;
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(true);
        } else {
          const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
          reject(new Error(`B2 Upload failed for ${file.name} (${sizeMB} MB) with status ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.ontimeout = () => {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        reject(new Error(`Upload timeout for ${file.name} (${sizeMB} MB). Large files may take longer to upload.`));
      };

      xhr.onerror = () => {
        const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
        reject(new Error(`Network error uploading ${file.name} (${sizeMB} MB). Please check your connection and try again.`));
      };

      xhr.send(file);
    });
  }
}

