import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface GalleryImage {
  _id: string;
  filename: string;
  url: string;
  uploadedAt: Date;
}

@Injectable({
  providedIn: 'root'
})
export class GalleryService {
  private apiUrl = `${environment.apiUrl}/gallery`;

  constructor(private http: HttpClient) { }

  // Get all gallery images
  getAllImages(): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(this.apiUrl);
  }

  // Get random images (for homepage)
  getRandomImages(numImages: number = 6): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(`${this.apiUrl}/random?numImages=${numImages}`);
  }

  // Upload images to gallery (requires admin authentication)
  uploadImages(files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });
    return this.http.post(`${this.apiUrl}/upload`, formData, { withCredentials: true });
  }
}

