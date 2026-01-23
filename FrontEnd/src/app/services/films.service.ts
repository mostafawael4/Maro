import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';

export interface Film {
  _id: string;
  filename: string;
  url: string;
  description: string;
  thumbnail: string | null;
  thumbnailFilename: string | null;
  uploadedAt: Date | string;
  __v?: number;
}

@Injectable({
  providedIn: 'root'
})
export class FilmsService {
  private apiUrl = `${environment.apiUrl}/films`;

  constructor(private http: HttpClient, private directUpload: DirectUploadService) { }

  // Get all films
  getAllFilms(): Observable<Film[]> {
    return this.http.get<Film[]>(this.apiUrl);
  } 

  // Upload a film
  uploadFilm(file: File, description: string): Observable<any> {
    return this.directUpload.uploadFiles(
        `${this.apiUrl}/prepare-direct-upload`,
        `${this.apiUrl}/confirm-direct-upload`,
        [file],
        {}, // No extra prepare data
        { description } // Pass description to confirm
    );
  }

  // Extract thumbnail for a film (requires admin authentication)
  extractFilmThumbnail(filmId: string, timeInSeconds: number): Observable<{ ok: boolean; thumbnail: string; thumbnailFilename: string }> {
    return this.http.post<{ ok: boolean; thumbnail: string; thumbnailFilename: string }>(
      `${this.apiUrl}/${filmId}/thumbnail`,
      { timeInSeconds },
      { withCredentials: true }
    );
  }

  // Delete a film (requires admin authentication)
  // Backend accepts either 'id' or 'fileName' in the request body
  deleteFilm(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete`, {
      body: { id },
      withCredentials: true
    });
  }
}

