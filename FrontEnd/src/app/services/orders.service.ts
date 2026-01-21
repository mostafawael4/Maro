import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OrderImage {
  filename: string;
  originalName?: string; // Original filename before upload
  url: string;
  uploadedAt: string;
  _id?: string;
  thumbnail?: string;
  thumbnailFilename?: string;
  foldername?: string | null;
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
  includeAccessoriesShots?: boolean;
  editSequence?: 'chronological' | 'random' | 'no-preference';
  stylePreference?: string[];
  highlightPreference?: string[];
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
}

export interface SelectedExtraOption {
  packageId: string;
  packageName: string;
  packageDisplayName: string;
  extraId: string;
  extraName: string;
  priceLabel: string;
  priceValue: number;
}

export interface OrderPricing {
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
  eventDate?: string;
  eventType?: string[];
  eventVenue?: string;
  timelineOfDay?: string;
  shootersStartTime?: string;
  shootersEndTime?: string;
  coupleDescription?: string;
  moodBoardLinks?: string[];
  favoriteSongs?: string[];
  specialMoments?: string;
  excludeShots?: string;
  vendors?: OrderFormVendors;
  filmEditing?: OrderFormFilmEditing;
  socialMediaInspiration?: string[];
  tiktokIdeas?: string[];
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
    image?: string; // Background image URL for order
    filename?: string; // Background image filename
    selectedAt?: string | Date; // When background was selected
  };
  media?: OrderImage[]; // Made optional to handle cases where backend might not send it
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

  constructor(private http: HttpClient) { }

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

  updateOrderBackgroundImage(orderId: string, filename: string): Observable<{ ok: boolean; backgroundImage: string; backgroundImageFilename: string }> {
    return this.http.put<{ ok: boolean; backgroundImage: string; backgroundImageFilename: string }>(
      `${this.apiUrl}/${orderId}/background-image`,
      { filename },
      { withCredentials: true }
    );
  }

  getDownloadUrl(orderId: string, filename: string): string {
    return `${this.apiUrl}/${orderId}/download/${filename}`;
  }

  /**
   * 1. Get upload tokens and check for duplicates from Backend
   * 2. Upload bytes directly to B2 (fastest)
   * 3. Inform Backend to sync metadata and generate thumbnails
   */
  uploadOrderMediaDirectly(orderId: string, files: File[], folderName: string): Observable<any> {
    return new Observable(observer => {
      const fileInfos = files.map(f => ({ originalname: f.name, mimetype: f.type }));
      
      this.http.post<any>(`${this.apiUrl}/${orderId}/prepare-direct-upload`, { 
        files: fileInfos, 
        foldername: folderName 
      }, { withCredentials: true }).subscribe({
        next: async (resp) => {
          if (!resp.ok) {
            observer.error(resp.message);
            return;
          }

          const { uploadSlots, duplicates } = resp;
          const successfulUploads: any[] = [];
          const failedUploads: any[] = [];
          let totalProgress = 0;
          const progressPerFile = 100 / (files.length || 1);

          // If everything is a duplicate, we can finish early
          if (uploadSlots.length === 0 && duplicates.length > 0) {
            observer.next({ type: 'complete', added: [], duplicates });
            observer.complete();
            return;
          }

          for (let i = 0; i < uploadSlots.length; i++) {
            const slot = uploadSlots[i];
            const file = files.find(f => f.name === slot.originalName);
            if (!file) continue;

            let retryCount = 0;
            const maxRetries = 2; // Total 3 attempts
            let success = false;

            while (retryCount <= maxRetries && !success) {
              try {
                await this.uploadToB2(slot.uploadUrl, slot.authorizationToken, slot.key, file, (progress) => {
                  const currentFileProgress = (progress / 100) * progressPerFile;
                  observer.next({ 
                    type: 'progress', 
                    percent: Math.round(totalProgress + currentFileProgress),
                    currentFile: file.name
                  });
                });
                
                success = true;
                successfulUploads.push({
                  filename: slot.filename,
                  originalName: slot.originalName,
                  mimetype: slot.mimetype
                });
              } catch (err) {
                retryCount++;
                if (retryCount <= maxRetries) {
                  console.warn(`Upload failed for ${file.name}, retrying (${retryCount}/${maxRetries})...`, err);
                  // Optional: add a small delay before retry
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                  console.error(`Direct upload failed for ${file.name} after ${maxRetries + 1} attempts:`, err);
                }
              }
            }
            
            if (!success) {
              failedUploads.push({
                  originalName: file.name,
                  reason: 'Max retries exceeded'
              });
            }

            totalProgress += progressPerFile;
          }

          // Step 3: Confirm with Backend (only successful ones)
          if (successfulUploads.length > 0) {
            this.http.post<any>(`${this.apiUrl}/${orderId}/confirm-direct-upload`, {
              uploadedFiles: successfulUploads,
              foldername: folderName
            }, { withCredentials: true }).subscribe({
              next: (confirmResp) => {
                observer.next({ type: 'complete', ...confirmResp, duplicates, failed: failedUploads });
                observer.complete();
              },
              error: (err) => observer.error('Failed to confirm upload with server')
            });
          } else {
            observer.next({ type: 'complete', added: [], duplicates, failed: failedUploads });
            observer.complete();
          }
        },
        error: (err) => observer.error('Failed to prepare upload slots')
      });
    });
  }

  private async uploadToB2(uploadUrl: string, token: string, fileName: string, file: File, onProgress: (p: number) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      
      xhr.setRequestHeader('Authorization', token);
      xhr.setRequestHeader('X-Bz-File-Name', encodeURIComponent(fileName));
      xhr.setRequestHeader('Content-Type', file.type || 'b2/x-auto');
      xhr.setRequestHeader('X-Bz-Content-Sha1', 'do_not_verify'); 
      
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = (event.loaded / event.total) * 100;
          onProgress(percent);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          reject(new Error(`B2 Upload failed with status ${xhr.status}: ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error('B2 XHR Network Error'));
      xhr.send(file);
    });
  }
}

