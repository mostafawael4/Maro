
import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';

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

  constructor(private http: HttpClient) { }

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
  ): Observable<any> { // Returns Observable of HttpEvent-like objects
    return new Observable(observer => {
      const fileInfos = files.map(f => ({ originalname: f.name, mimetype: f.type, size: f.size }));
      const prepareBody = { files: fileInfos, ...extraPrepareData };

      // 1. Prepare
      this.http.post<any>(prepareUrl, prepareBody, { withCredentials: true }).subscribe({
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

          const { uploadSlots, duplicates } = resp; 
          
          if (!uploadSlots || uploadSlots.length === 0) {
             observer.next(new HttpResponse({
                 body: { ok: true, type: 'complete', added: [], duplicates: duplicates || [] }
             }));
             observer.complete();
             return;
          }

          const successfulUploads: any[] = [];
          const failedUploads: any[] = [];
          let totalProgress = 0;
          const progressPerFile = 100 / (files.length || 1);

          // 2. Upload to B2
          for (let i = 0; i < uploadSlots.length; i++) {
            const slot = uploadSlots[i];
            const file = files.find(f => f.name === slot.originalName);
            if (!file) continue;

            let retryCount = 0;
            const maxRetries = 2; 
            let success = false;

            while (retryCount <= maxRetries && !success) {
              try {
                // Use key (full path) if available, otherwise filename (basename)
                const b2FileName = slot.key || slot.filename;
                await this.uploadToB2(slot.uploadUrl, slot.authorizationToken, b2FileName, file, (progress) => {
                  const currentFileProgress = (progress / 100) * progressPerFile;
                  const totalPercent = Math.round(totalProgress + currentFileProgress);
                  
                  // Emit HttpEventType.UploadProgress
                  observer.next({ 
                    type: HttpEventType.UploadProgress, 
                    loaded: totalPercent, 
                    total: 100 
                  });
                });
                success = true;
                successfulUploads.push({
                  filename: slot.filename, // Keep basename for backend confirmation/verification logic
                  originalName: slot.originalName,
                  mimetype: slot.mimetype
                });
              } catch (err) {
                retryCount++;
                if (retryCount <= maxRetries) {
                   await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
            }

            if (!success) {
               failedUploads.push({ originalName: file.name, reason: 'Upload failed' });
            }
            totalProgress += progressPerFile;
          }

          // 3. Confirm
          if (successfulUploads.length > 0) {
            const confirmBody = { uploadedFiles: successfulUploads, ...extraConfirmData };
            this.http.post<any>(confirmUrl, confirmBody, { withCredentials: true }).subscribe({
                next: (confirmResp) => {
                    // Emit HttpEventType.Response
                    observer.next(new HttpResponse({
                        body: { 
                            type: 'complete', 
                            ...confirmResp, 
                            duplicates: [...(duplicates || []), ...(confirmResp.duplicates || [])],
                            failed: [...failedUploads, ...(confirmResp.failed || [])]
                        }
                    }));
                    observer.complete();
                },
                error: (err) => observer.error(err)
            });
          } else {
            observer.next(new HttpResponse({
                body: { type: 'complete', added: [], duplicates: duplicates || [], failed: failedUploads }
            }));
            observer.complete();
          }

        },
        error: (err) => observer.error(err)
      });
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
          reject(new Error(`B2 Upload failed with status ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error('B2 XHR Network Error'));
      xhr.send(file);
    });
  }
}

