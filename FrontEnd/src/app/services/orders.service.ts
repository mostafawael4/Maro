import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpResponse } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';

export interface OrderImage {
  filename: string;
  originalName?: string; // Original filename before upload
  url: string;
  uploadedAt: string;
  _id?: string;
  thumbnail?: string;
  thumbnailFilename?: string;
  medium?: string; // 1200w
  hero?: string; // 2000w
  foldername?: string | null;
  size?: number; // File size in bytes (stored by backend on upload)
}

export interface OrderFormVendors {
  photographers?: string[];
  cinematographers?: string[];
  makeupArtist?: string;
  hairStylist?: string;
  dressDesigner?: string;
  eventPlanner?: string;
  dj?: string;
  lighting?: string;
  entertainment?: string;
  others?: string;
}

export interface OrderFormFilmEditing {
  stylePreference?: string[];
  teaserStyleLinks?: string[];
}

export interface SelectedPackageOption {
  packageId: string;
  packageName: string;
  packageDisplayName: string;
}

export interface SelectedCollectionOption {
  packageId: string;
  packageName: string;
  packageDisplayName: string;
  collectionId: string;
  collectionName: string;
  priceLabel: string;
  priceValue: number;
  quantity: number;
}

export interface SelectedExtraOption {
  packageId: string;
  packageName: string;
  packageDisplayName: string;
  extraId: string;
  extraName: string;
  priceLabel: string;
  priceValue: number;
  quantity: number;
}

export interface OrderPricing {
  currency?: 'EGP' | 'AED' | 'USD';    // stored at order-creation time
  packages?: SelectedPackageOption[];
  collections?: SelectedCollectionOption[];
  extras?: SelectedExtraOption[];
  promoCode?: string;
  subtotal?: number;
  discount?: number;
  total?: number;
  depositPaid?: number;
  remainingBalance?: number;
}

export interface OrderForm {
  _id?: string;
  brideAndGroomNames?: string;
  assignedPhotographers?: string[];
  eventDate?: string;
  eventType?: string[];
  eventVenue?: string;
  vendors?: OrderFormVendors;
  filmEditing?: OrderFormFilmEditing;
  socialMediaInspiration?: string[];
  pricing?: OrderPricing;
}

export interface Feedback {
  _id?: string;
  feedback: string;
  createdAt?: string;
}

export interface Order {
  _id: string;
  email: string;
  clientName?: string;
  notes?: string;
  status: 'pending' | 'in-progress' | 'done';
  orderBackground?: {
    image?: string;
    thumbnail?: string;
    filename?: string;
    selectedAt?: string | Date;
  };
  media?: OrderImage[];
  mediaCount?: number;
  selectedMedia?: string[];
  mediaPassword?: string | null;
  orderForm?: OrderForm;
  feedbacks?: Feedback[];
  createdAt: string;
  updatedAt: string;
  __v?: number;
}

export interface OrdersResponse {
  ok: boolean;
  orders: Order[];
}

export interface SingleOrderResponse {
  ok: boolean;
  order: Order;
}

export interface OrderFoldersResponse {
  ok: boolean;
  count: number;
  folders: string[];
  /** Total bytes per folder, computed on the server from stored media.size fields. */
  folderSizes: { [folderName: string]: number };
}

export interface FolderMediaResponse {
  ok: boolean;
  foldername: string;
  count: number;
  media: OrderImage[];
}

@Injectable({
  providedIn: 'root'
})
export class OrdersService {
  private apiUrl = `${environment.apiUrl}/orders`;

  constructor(
    private http: HttpClient,
    private directUpload: DirectUploadService
  ) { }


  getOrders(): Observable<OrdersResponse> {
    return this.http.get<OrdersResponse>(this.apiUrl, { withCredentials: true });
  }

  getOrderById(id: string): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/${id}`, { withCredentials: true });
  }

  getOrderFolders(orderId: string): Observable<OrderFoldersResponse> {
    return this.http.get<OrderFoldersResponse>(`${this.apiUrl}/folders/${orderId}`, { withCredentials: true });
  }

  getFolderMedia(orderId: string, folderName: string): Observable<FolderMediaResponse> {
    return this.http.get<FolderMediaResponse>(`${this.apiUrl}/folders/${orderId}/${folderName}`, { withCredentials: true });
  }

  deleteOrderFolder(orderId: string, folderName: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/folders/${orderId}/${folderName}`, { withCredentials: true });
  }

  sendOrderCompletionEmail(orderId: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/emails/${orderId}`, {}, { withCredentials: true });
  }

  uploadOrderImages(orderId: string, files: File[], folderName: string): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('media', file); // Changed from 'images' to 'media' to match backend
    });
    formData.append('foldername', folderName);
    return this.http.post<any>(`${this.apiUrl}/${orderId}/upload`, formData, {
      withCredentials: true,
      reportProgress: true,
      observe: 'events'
    });
  }

  /**
   * Upload order images in chunks to reduce memory usage and improve performance
   * Files are grouped by total size rather than count for optimal performance
   * @param orderId - The order ID
   * @param files - Array of files to upload
   * @param folderName - The folder name
   * @param maxChunkSize - Maximum size per chunk in bytes (default: 100MB)
   * @returns Observable that emits progress events for each chunk
   */
  uploadOrderImagesInChunks(orderId: string, files: File[], folderName: string, maxChunkSize: number = 100 * 1024 * 1024): Observable<any> {
    return new Observable(observer => {
      // Group files into chunks based on size
      const chunks: File[][] = [];
      let currentChunk: File[] = [];
      let currentChunkSize = 0;

      for (const file of files) {
        // If adding this file would exceed the max chunk size and we already have files in the chunk
        if (currentChunkSize + file.size > maxChunkSize && currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [file];
          currentChunkSize = file.size;
        } else {
          currentChunk.push(file);
          currentChunkSize += file.size;
        }
      }

      // Add the last chunk if it has files
      if (currentChunk.length > 0) {
        chunks.push(currentChunk);
      }

      const totalFiles = files.length;
      const totalChunks = chunks.length;
      let processedFiles = 0;

      // Aggregate results from all chunks
      const aggregatedResults = {
        added: [] as any[],
        duplicates: [] as any[],
        failed: [] as any[]
      };

      const uploadChunk = (chunkIndex: number) => {
        const chunkFiles = chunks[chunkIndex];
        const currentChunk = chunkIndex + 1;
        const chunkSizeBytes = chunkFiles.reduce((sum, f) => sum + f.size, 0);

        // Emit chunk start event
        observer.next({
          type: 'chunk-start',
          chunkIndex: currentChunk,
          totalChunks,
          chunkFiles: chunkFiles.length,
          chunkSize: chunkSizeBytes,
          totalFiles,
          processedFiles
        });

        // Upload the chunk
        this.uploadOrderImages(orderId, chunkFiles, folderName).subscribe({
          next: (event: any) => {
            // Forward progress events with chunk information
            if (event.type === HttpEventType.UploadProgress) {
              const chunkProgress = event.loaded / (event.total || 1);
              const overallProgress = (processedFiles + (chunkFiles.length * chunkProgress)) / totalFiles;

              observer.next({
                type: HttpEventType.UploadProgress,
                loaded: Math.round(processedFiles + (chunkFiles.length * chunkProgress)),
                total: totalFiles,
                chunkIndex: currentChunk,
                totalChunks,
                chunkProgress: Math.round(chunkProgress * 100),
                overallProgress: Math.round(overallProgress * 100)
              });
            } else if (event.type === HttpEventType.Response) {
              // Chunk upload complete
              const response = event.body;
              processedFiles += chunkFiles.length;

              // Aggregate results
              if (response.added) aggregatedResults.added.push(...response.added);
              if (response.duplicates) aggregatedResults.duplicates.push(...response.duplicates);
              if (response.failed) aggregatedResults.failed.push(...response.failed);

              observer.next({
                type: 'chunk-complete',
                chunkIndex: currentChunk,
                totalChunks,
                processedFiles,
                totalFiles,
                chunkResponse: response
              });

              // Upload next chunk or complete
              if (chunkIndex + 1 < totalChunks) {
                uploadChunk(chunkIndex + 1);
              } else {
                // All chunks complete
                observer.next({
                  type: HttpEventType.Response,
                  body: {
                    ok: true,
                    added: aggregatedResults.added,
                    duplicates: aggregatedResults.duplicates,
                    failed: aggregatedResults.failed,
                    message: `${aggregatedResults.added.length} file(s) uploaded, ${aggregatedResults.duplicates.length} duplicate(s) skipped, ${aggregatedResults.failed.length} failed.`
                  }
                });
                observer.complete();
              }
            }
          },
          error: (err) => {
            observer.next({
              type: 'chunk-error',
              chunkIndex: currentChunk,
              totalChunks,
              error: err
            });
            observer.error(err);
          }
        });
      };

      // Start uploading from first chunk
      uploadChunk(0);
    });
  }

  getOrdersByEmail(email: string): Observable<OrdersResponse> {
    return this.http.get<OrdersResponse>(`${this.apiUrl}/view/orders-by-email?email=${email}`);
  }

  setMediaPassword(orderId: string, selectedMediaIds: string[], password: string): Observable<{ ok: boolean; selectedMedia: string[]; hasPassword: boolean }> {
    return this.http.put<{ ok: boolean; selectedMedia: string[]; hasPassword: boolean }>(
      `${this.apiUrl}/${orderId}/select-media`,
      { selectedMediaIds, password },
      { withCredentials: true }
    );
  }

  getOrderByPassword(password: string): Observable<{ ok: boolean; order: Order; folderSizes: { [key: string]: number } }> {
    return this.http.get<{ ok: boolean; order: Order; folderSizes: { [key: string]: number } }>(
      `${this.apiUrl}/view/by-password?password=${encodeURIComponent(password)}`
    );
  }

  updateOrderStatus(orderId: string, status: string): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${orderId}/status`, { status }, { withCredentials: true });
  }

  createOrder(orderData: { email: string; clientName?: string; notes?: string; orderForm?: OrderForm }): Observable<any> {
    return this.http.post<any>(this.apiUrl, orderData);
  }

  deleteOrder(orderId: string): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${orderId}`, { withCredentials: true });
  }

  deleteOrderMedia(orderId: string, filenames: string[]): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/${orderId}/deletemedia`, {
      body: { filenames },
      withCredentials: true
    });
  }

  downloadSelectedFiles(orderId: string, filenames: string[]) {
    return this.http.post(`${this.apiUrl}/orders/${orderId}/download-selected`, { filenames }, {
      responseType: 'blob',
      withCredentials: true
    });
  }

  generateThumbnails(orderId: string) {
    return this.http.post<{ ok: boolean, result: any }>(`${this.apiUrl}/${orderId}/generate-thumbnails`, {}, {
      withCredentials: true
    });
  }

  updateOrder(orderId: string, updateFields: Partial<Order>): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${orderId}`, updateFields);
  }

  submitFeedback(orderId: string, feedback: string): Observable<any> {
    // The endpoint is /feedbacks/orders/:orderId/feedback based on backend routes
    return this.http.post<any>(`${environment.apiUrl}/feedbacks/orders/${orderId}/feedback`,
      { feedback },
      { withCredentials: true }
    );
  }

  getOrderFeedbacks(orderId: string): Observable<any> {
    // The endpoint is /feedbacks/orders/:orderId/feedbacks based on backend routes
    return this.http.get<any>(`${environment.apiUrl}/feedbacks/orders/${orderId}/feedbacks`, {
      withCredentials: true
    });
  }

  createGeneralFeedback(feedback: string): Observable<Feedback> {
    return this.http.post<Feedback>(`${environment.apiUrl}/feedbacks`, { feedback });
  }

  getAllFeedbacks(feedbackCounts?: number): Observable<any> {
    // The endpoint is /feedbacks/all based on backend routes
    let url = `${environment.apiUrl}/feedbacks/all`;
    if (feedbackCounts) {
      url += `?feedbackCounts=${feedbackCounts}`;
    }
    return this.http.get<any>(url, {
      withCredentials: true
    });
  }

  deleteFeedback(orderId: string, feedbackId: string): Observable<any> {
    // The endpoint is /feedbacks/orders/:orderId/:feedbackId based on backend routes
    return this.http.delete<any>(`${environment.apiUrl}/feedbacks/orders/${orderId}/${feedbackId}`, {
      withCredentials: true
    });
  }

  deleteGeneralFeedback(feedbackId: string): Observable<any> {
    return this.http.delete<any>(`${environment.apiUrl}/feedbacks/${feedbackId}`, {
      withCredentials: true
    });
  }

  getVideoDuration(orderId: string, filename: string): Observable<{ ok: boolean; duration: number }> {
    return this.http.get<{ ok: boolean; duration: number }>(
      `${this.apiUrl}/${orderId}/video/${filename}/duration`,
      { withCredentials: true }
    );
  }

  extractVideoThumbnail(orderId: string, filename: string, timeInSeconds: number): Observable<{ ok: boolean; thumbnail: string; thumbnailFilename: string }> {
    return this.http.post<{ ok: boolean; thumbnail: string; thumbnailFilename: string }>(
      `${this.apiUrl}/${orderId}/video/${filename}/thumbnail`,
      { timeInSeconds },
      { withCredentials: true }
    );
  }

  updateOrderBackgroundImage(orderId: string, filename: string): Observable<{ ok: boolean; backgroundImage: string; backgroundImageFilename: string; backgroundImageThumbnail: string | null }> {
    return this.http.put<{ ok: boolean; backgroundImage: string; backgroundImageFilename: string; backgroundImageThumbnail: string | null }>(`${this.apiUrl}/${orderId}/background-image`,
      { filename },
      { withCredentials: true }
    );
  }

  getDownloadUrl(orderId: string, filename: string): string {
    return `${this.apiUrl}/${orderId}/download/${filename}`;
  }

  getFolderDownloadUrl(orderId: string, folderName: string): string {
    return `${this.apiUrl}/folders/${orderId}/${folderName}/download`;
  }

  private activeZipJobSubject = new Subject<{
    stage: 'preparing' | 'polling' | 'ready' | 'error';
    progress?: number;
    filesProcessed?: number;
    totalFiles?: number;
    downloadUrl?: string;
    error?: string;
    jobId?: string;
    folderName?: string;
    orderId?: string;
  } | null>();

  public activeZipJob$ = this.activeZipJobSubject.asObservable();
  private currentJob: any = null;

  /** Returns true when running inside iOS Safari (iPhone or iPad). */
  isIOS(): boolean {
    if (typeof navigator === 'undefined') return false;
    return /iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  /**
   * Save active job info to localStorage so it can be resumed after refresh/close
   */
  private saveActiveJob(job: any) {
    if (!job) {
      localStorage.removeItem('activeZipJob');
      return;
    }
    localStorage.setItem('activeZipJob', JSON.stringify(job));
  }

  /**
   * Clears the current job state
   */
  clearActiveZipJob() {
    this.currentJob = null;
    this.activeZipJobSubject.next(null);
    this.saveActiveJob(null);
  }

  /**
   * On app startup, checks if there was a job in progress and resumes polling
   */
  resumeActiveJob() {
    const saved = localStorage.getItem('activeZipJob');
    if (!saved) return;

    try {
      const job = JSON.parse(saved);
      if (job && job.jobId) {
        this.currentJob = job;
        // Resume polling
        this.startPolling(job.orderId, job.folderName, job.jobId);
      }
    } catch (e) {
      localStorage.removeItem('activeZipJob');
    }
  }

  /**
   * Trigger the background-zip flow (prepare → poll → window.open).
   * Shared by components to start a global background task.
   */
  startBackgroundZip(orderId: string, folderName: string, clientEmail?: string | null): void {
    if (this.currentJob) {
      // Already running a zip job? We currently support 1 at a time per tab
      return;
    }

    this.activeZipJobSubject.next({ stage: 'preparing', progress: 0, folderName, orderId });

    this.prepareFolderDownload(orderId, folderName, clientEmail).subscribe({
      next: (res) => {
        if (!res.ok || !res.jobId) {
          this.activeZipJobSubject.next({ stage: 'error', error: 'Failed to start download preparation.', folderName, orderId });
          return;
        }

        const jobId = res.jobId;
        this.currentJob = { jobId, orderId, folderName, clientEmail };
        this.saveActiveJob(this.currentJob);

        this.activeZipJobSubject.next({ 
          stage: 'polling', 
          jobId, 
          progress: 0, 
          totalFiles: res.totalFiles,
          folderName,
          orderId
        });

        this.startPolling(orderId, folderName, jobId);
      },
      error: (err) => {
        this.activeZipJobSubject.next({ 
          stage: 'error', 
          error: err?.error?.message || 'Failed to start download.',
          folderName, 
          orderId 
        });
      }
    });
  }

  private startPolling(orderId: string, folderName: string, jobId: string) {
    let attempts = 0;
    const maxAttempts = 240; // 20 minutes

    const poll = () => {
      // If the job was cleared manually by the user
      if (!this.currentJob || this.currentJob.jobId !== jobId) return;

      if (attempts >= maxAttempts) {
        this.activeZipJobSubject.next({ 
          stage: 'error', 
          error: 'Preparation timed out. Please try again.',
          jobId,
          folderName,
          orderId
        });
        return;
      }
      attempts++;

      this.pollFolderDownloadStatus(orderId, folderName, jobId).subscribe({
        next: (status) => {
          if (status.status === 'ready' && status.downloadUrl) {
            this.activeZipJobSubject.next({
              stage: 'ready',
              downloadUrl: status.downloadUrl,
              jobId,
              progress: 100,
              filesProcessed: status.filesProcessed,
              totalFiles: status.totalFiles,
              folderName,
              orderId
            });
            // We keep currentJob so the UI stays in 'ready' stage until user clicks 'Download' or 'Close'
          } else if (status.status === 'error') {
            this.activeZipJobSubject.next({ 
              stage: 'error', 
              error: status.error || 'Download preparation failed.',
              jobId,
              folderName,
              orderId
            });
            this.saveActiveJob(null); // Stop persisting error state
          } else {
            // Still pending/building — update progress
            this.activeZipJobSubject.next({
              stage: 'polling',
              jobId,
              progress: status.progress,
              filesProcessed: status.filesProcessed,
              totalFiles: status.totalFiles,
              folderName,
              orderId
            });
            setTimeout(poll, 5000);
          }
        },
        error: () => {
          // Network blip — keep polling
          setTimeout(poll, 5000);
        }
      });
    };

    setTimeout(poll, 1000);
  }

  /**
   * legacy method — components should migrate to startBackgroundZip
   */
  downloadFolderZip(orderId: string, folderName: string, clientEmail?: string | null): void {
    if (this.isIOS()) {
      this.startBackgroundZip(orderId, folderName, clientEmail);
    } else {
      const url = this.getFolderDownloadUrl(orderId, folderName);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${folderName}.zip`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  prepareFolderDownload(orderId: string, folderName: string, clientEmail?: string | null): Observable<{ ok: boolean; jobId: string; totalFiles: number; message: string }> {
    const body = clientEmail ? { clientEmail } : {};
    return this.http.post<{ ok: boolean; jobId: string; totalFiles: number; message: string }>(
      `${this.apiUrl}/folders/${orderId}/${folderName}/prepare-download`,
      body,
      { withCredentials: true }
    );
  }

  pollFolderDownloadStatus(orderId: string, folderName: string, jobId: string): Observable<{
    ok: boolean;
    status: string;
    progress?: number;
    filesProcessed?: number;
    totalFiles?: number;
    downloadUrl?: string;
    error?: string;
  }> {
    return this.http.get<{
      ok: boolean;
      status: string;
      progress?: number;
      filesProcessed?: number;
      totalFiles?: number;
      downloadUrl?: string;
      error?: string;
    }>(
      `${this.apiUrl}/folders/${orderId}/${folderName}/download-status/${jobId}`,
      { withCredentials: true }
    );
  }

  getSelectedFilesDownloadUrl(orderId: string): string {
    return `${this.apiUrl}/${orderId}/download-selected`;
  }


  /**
   * 1. Get upload tokens and check for duplicates from Backend
   * 2. Upload bytes directly to B2 (fastest)
   * 3. Inform Backend to sync metadata and generate thumbnails
   */
  uploadOrderMediaDirectly(orderId: string, files: File[], folderName: string): Observable<any> {
    return this.directUpload.uploadFiles(
      `${this.apiUrl}/${orderId}/prepare-direct-upload`,
      `${this.apiUrl}/${orderId}/confirm-direct-upload`,
      files,
      { foldername: folderName },
      { foldername: folderName, orderId: orderId }
    );
  }
}

