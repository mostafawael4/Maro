import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';

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

  constructor(private http: HttpClient, private directUpload: DirectUploadService) { }

  // Get all homepage images
  getAllImages(): Observable<HomePageImage[]> {
    return this.http.get<HomePageImage[]>(this.apiUrl);
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

