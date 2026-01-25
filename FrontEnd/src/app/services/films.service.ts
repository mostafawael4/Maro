import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';
import { MemoryCacheService } from './memory-cache.service';
import { IndexedDBCacheService } from './indexeddb-cache.service';

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
  private readonly CACHE_KEY = 'films:list';

  constructor(
    private http: HttpClient,
    private directUpload: DirectUploadService,
    private memoryCache: MemoryCacheService,
    private indexedDB: IndexedDBCacheService
  ) { }

  // Get all films
  getAllFilms(): Observable<Film[]> {
    // Layer 2: Check memory cache first
    const memCached = this.memoryCache.get<Film[]>(this.CACHE_KEY);
    if (memCached) {
      console.log('[Cache] Films from memory');
      return of(memCached);
    }

    // Layer 4: Check IndexedDB (Async)
    return from(this.indexedDB.get<Film[]>(this.indexedDB.LARGE_DATA_STORE, this.CACHE_KEY)).pipe(
      switchMap((dbCached: Film[] | null) => {
        if (dbCached) {
          console.log('[Cache] Films from IndexedDB');
          // Populate memory cache
          this.memoryCache.set(this.CACHE_KEY, dbCached);
          return of(dbCached);
        }

        // Layer 1 & 5: Fetch from API
        console.log('[Cache] Films from API');
        return this.http.get<Film[]>(this.apiUrl).pipe(
          tap(films => {
            // Update caches
            this.memoryCache.set(this.CACHE_KEY, films);
            // Save to IndexedDB
            this.indexedDB.set(this.indexedDB.LARGE_DATA_STORE, this.CACHE_KEY, films);
          }),
          catchError(error => {
            console.error('Error fetching films:', error);
            throw error;
          })
        );
      })
    );
  }

  // Upload a film
  uploadFilm(file: File, description: string): Observable<any> {
    return this.directUpload.uploadFiles(
        `${this.apiUrl}/prepare-direct-upload`,
        `${this.apiUrl}/confirm-direct-upload`,
        [file],
        {}, // No extra prepare data
        { description } // Pass description to confirm
    ).pipe(
      tap(() => {
        // Invalidate caches after upload
        this.invalidateCache();
      })
    );
  }

  // Extract thumbnail for a film (requires admin authentication)
  extractFilmThumbnail(filmId: string, timeInSeconds: number): Observable<{ ok: boolean; thumbnail: string; thumbnailFilename: string }> {
    return this.http.post<{ ok: boolean; thumbnail: string; thumbnailFilename: string }>(
      `${this.apiUrl}/${filmId}/thumbnail`,
      { timeInSeconds },
      { withCredentials: true }
    ).pipe(
      tap(() => {
        // Invalidate caches after thumbnail update
        this.invalidateCache();
      })
    );
  }

  // Delete a film (requires admin authentication)
  // Backend accepts either 'id' or 'fileName' in the request body
  deleteFilm(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete`, {
      body: { id },
      withCredentials: true
    }).pipe(
      tap(() => {
        // Invalidate caches after delete
        this.invalidateCache();
      })
    );
  }

  private invalidateCache(): void {
    this.memoryCache.delete(this.CACHE_KEY);
    this.indexedDB.delete(this.indexedDB.LARGE_DATA_STORE, this.CACHE_KEY);
  }
}

