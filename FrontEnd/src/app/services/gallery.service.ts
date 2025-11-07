import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

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
  private apiUrl = 'http://localhost:4000/gallery';

  constructor(private http: HttpClient) { }

  // Get all gallery images
  getAllImages(): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(this.apiUrl);
  }

  // Get random images (for homepage)
  getRandomImages(numImages: number = 6): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(`${this.apiUrl}/random?numImages=${numImages}`);
  }

  // Upload images to gallery
  uploadImages(files: File[]): Observable<any> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('images', file);
    });
    return this.http.post(`${this.apiUrl}/upload`, formData);
  }
}

