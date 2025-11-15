import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface OrderImage {
  filename: string;
  url: string;
  uploadedAt: string;
  _id?: string;
  thumbnail?: string;
  thumbnailFilename?: string;
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

  uploadOrderImages(orderId: string, files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('media', file); // Changed from 'images' to 'media' to match backend
    });
    return this.http.post<any>(`${this.apiUrl}/${orderId}/upload`, formData, { withCredentials: true });
  }

  getOrdersByEmail(email: string): Observable<SingleOrderResponse> {
    return this.http.get<SingleOrderResponse>(`${this.apiUrl}/view/by-email?email=${email}`);
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
    // The endpoint is /feedbacks/:orderId/feedback based on backend routes
    return this.http.post<any>(`${environment.apiUrl}/feedbacks/${orderId}/feedback`, 
      { feedback },
      { withCredentials: true }
    );
  }

  getAllFeedbacks(feedbackCounts?: number): Observable<any> {
    // The endpoint is /feedbacks/all-feedbacks based on backend routes
    let url = `${environment.apiUrl}/feedbacks/all-feedbacks`;
    if (feedbackCounts) {
      url += `?feedbackCounts=${feedbackCounts}`;
    }
    return this.http.get<any>(url, {
      withCredentials: true
    });
  }

  deleteFeedback(orderId: string, feedbackId: string): Observable<any> {
    // The endpoint is /feedbacks/:orderId/:feedbackId based on backend routes
    return this.http.delete<any>(`${environment.apiUrl}/feedbacks/${orderId}/${feedbackId}`, {
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
}

