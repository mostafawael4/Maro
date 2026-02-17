import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';


export interface HomePageImage {
  _id: string;
  filename: string;
  url: string;
  thumbnail?: string;
  medium?: string;
  hero?: string;
  uploadedAt: Date | string;
}

@Injectable({
  providedIn: 'root'
})
export class HomePageService {
  private apiUrl = `${environment.apiUrl}/homepage`;


  constructor(
    private http: HttpClient,
    private directUpload: DirectUploadService,

  ) { }

  // Get all homepage images with pagination
  getAllImages(page: number = 1, limit: number = 8): Observable<{ items: HomePageImage[], total: number, hasMore: boolean }> {
    return this.http.get<{ items: HomePageImage[], total: number, hasMore: boolean }>(`${this.apiUrl}?page=${page}&limit=${limit}`).pipe(
      catchError(error => {
        console.error('Error fetching homepage images:', error);
        throw error;
      })
    );
  }

  // Upload images to homepage
  uploadImages(files: File[]): Observable<any> {
    return this.directUpload.uploadFiles(
      `${this.apiUrl}/prepare-direct-upload`,
      `${this.apiUrl}/confirm-direct-upload`,
      files
    );
  }

  // Delete an image from homepage (requires admin authentication)
  deleteImage(fileName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete`, {
      body: { fileName },
      withCredentials: true
    });
  }


}

