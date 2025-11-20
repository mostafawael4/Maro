import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { HttpEventType } from '@angular/common/http';

export interface HomePageImage {
  _id: string;
  filename: string;
  url: string;
  uploadedAt: Date | string;
}

@Injectable({
  providedIn: 'root'
})
export class HomePageService {
  private apiUrl = `${environment.apiUrl}/homepage`;

  constructor(private http: HttpClient) { }

  // Get all homepage images
  getAllImages(): Observable<HomePageImage[]> {
    return this.http.get<HomePageImage[]>(this.apiUrl);
  }

  // Upload images to homepage (requires admin authentication)
  uploadImages(files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });
    return this.http.post(`${this.apiUrl}/upload`, formData, {
      withCredentials: true,
      reportProgress: true,
      observe: 'events'
    });
  }

  // Delete an image from homepage (requires admin authentication)
  deleteImage(fileName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete`, {
      body: { fileName },
      withCredentials: true
    });
  }
}

