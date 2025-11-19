import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
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

  updateVideoThumbnail(orderId: string, videoFilename: string, thumbnail: string, thumbnailFilename: string): Observable<{ ok: boolean; order: Order }> {
    // First get the current order to update the media array
    return this.getOrderById(orderId).pipe(
      switchMap((response: any) => {
        const order = response.order || response;
        if (!order || !order.media) {
          throw new Error('Order or media not found');
        }
        
        // Find and update the video media item
        const mediaIndex = order.media.findIndex((m: OrderImage) => m.filename === videoFilename);
        if (mediaIndex === -1) {
          throw new Error('Video not found in order media');
        }
        
        // Update the thumbnail
        order.media[mediaIndex].thumbnail = thumbnail;
        order.media[mediaIndex].thumbnailFilename = thumbnailFilename;
        
        // Use the general PUT endpoint to update the order
        return this.http.put<{ ok: boolean; order: Order }>(
          `${this.apiUrl}/${orderId}`,
          { media: order.media },
          { withCredentials: true }
        );
      })
    );
  }
}

