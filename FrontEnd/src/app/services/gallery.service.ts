import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';


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


  constructor(
    private http: HttpClient,
    private directUpload: DirectUploadService,

  ) { }

  // Get all gallery images
  getAllImages(): Observable<GalleryImage[]> {
    return this.http.get<GalleryImage[]>(this.apiUrl).pipe(
      catchError(error => {
        console.error('Error fetching gallery images:', error);
        throw error;
      })
    );
  }

  // Upload images to gallery
  uploadImages(files: File[]): Observable<any> {
    return this.directUpload.uploadFiles(
        `${this.apiUrl}/prepare-direct-upload`,
        `${this.apiUrl}/confirm-direct-upload`,
        files
    );
  }

  // Delete an image from gallery (requires admin authentication)
  deleteImage(fileName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete`, {
      body: { fileName },
      withCredentials: true
    });
  }


}


