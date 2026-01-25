import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, from } from 'rxjs';
import { tap, catchError, switchMap } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { DirectUploadService } from './direct-upload.service';
import { MemoryCacheService } from './memory-cache.service';
import { IndexedDBCacheService } from './indexeddb-cache.service';

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
  private readonly CACHE_KEY = 'gallery:list';

  constructor(
    private http: HttpClient,
    private directUpload: DirectUploadService,
    private memoryCache: MemoryCacheService,
    private indexedDB: IndexedDBCacheService
  ) { }

  // Get all gallery images
  getAllImages(): Observable<GalleryImage[]> {
    // Layer 2: Check memory cache first
    const memCached = this.memoryCache.get<GalleryImage[]>(this.CACHE_KEY);
    if (memCached) {
      console.log('[Cache] Gallery images from memory');
      return of(memCached);
    }

    // Layer 4: Check IndexedDB (Async)
    return from(this.indexedDB.get<GalleryImage[]>(this.indexedDB.LARGE_DATA_STORE, this.CACHE_KEY)).pipe(
      switchMap((dbCached: GalleryImage[] | null) => {
        if (dbCached) {
          console.log('[Cache] Gallery images from IndexedDB');
          // Populate memory cache
          this.memoryCache.set(this.CACHE_KEY, dbCached);
          return of(dbCached);
        }

        // Layer 1 & 5: Fetch from API
        console.log('[Cache] Gallery images from API');
        return this.http.get<GalleryImage[]>(this.apiUrl).pipe(
          tap(images => {
            // Update caches
            this.memoryCache.set(this.CACHE_KEY, images);
            // Save to IndexedDB
            this.indexedDB.set(this.indexedDB.LARGE_DATA_STORE, this.CACHE_KEY, images);
          }),
          catchError(error => {
            console.error('Error fetching gallery images:', error);
            throw error;
          })
        );
      })
    );
  }

  // Upload images to gallery
  uploadImages(files: File[]): Observable<any> {
    return this.directUpload.uploadFiles(
        `${this.apiUrl}/prepare-direct-upload`,
        `${this.apiUrl}/confirm-direct-upload`,
        files
    ).pipe(
      tap(() => {
        // Invalidate caches after upload
        this.invalidateCache();
      })
    );
  }

  // Delete an image from gallery (requires admin authentication)
  deleteImage(fileName: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/delete`, {
      body: { fileName },
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


