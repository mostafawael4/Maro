import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

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

  constructor(private http: HttpClient) { }

  // Get all films
  getAllFilms(): Observable<Film[]> {
    return this.http.get<Film[]>(this.apiUrl);
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

