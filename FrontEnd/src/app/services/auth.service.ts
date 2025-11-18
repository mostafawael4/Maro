import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/admin`;
  private readonly AUTH_STORAGE_KEY = 'maro_admin_auth';
  private isBrowser: boolean;
  
  // Helper function to read from localStorage safely (only in browser)
  private readAuthFromStorage(): boolean {
    try {
      if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
        const savedAuthState = localStorage.getItem(this.AUTH_STORAGE_KEY);
        return savedAuthState === 'true';
      }
    } catch (e) {
      // localStorage might be disabled or not available
    }
    return false;
  }
  
  // Initialize BehaviorSubject - will be updated immediately in constructor if in browser
  // Start with false as default (safe for SSR)
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  private authCheckComplete = new BehaviorSubject<boolean>(false);
  public authCheckComplete$ = this.authCheckComplete.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    
    // CRITICAL: Update auth state IMMEDIATELY in browser (before any component can access it)
    // Since constructor runs synchronously and components inject after, this prevents flash
    if (this.isBrowser) {
      const authState = this.readAuthFromStorage();
      // Update the BehaviorSubject synchronously - this happens BEFORE any component renders
      this.isAuthenticatedSubject.next(authState);
      // Mark as complete immediately - components won't wait
      this.authCheckComplete.next(true);
      
      // Verify with server in next tick (non-blocking)
      Promise.resolve().then(() => {
        this.checkAuth();
      });
    } else {
      // On server, stay at false and mark complete
      this.authCheckComplete.next(true);
    }
  }

  // Synchronous getter for immediate access to auth state
  get isAuthenticatedValue(): boolean {
    return this.isAuthenticatedSubject.value;
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { username, password }, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response.ok) {
            this.isAuthenticatedSubject.next(true);
            if (this.isBrowser) {
              localStorage.setItem(this.AUTH_STORAGE_KEY, 'true');
            }
          }
        })
      );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true })
      .pipe(
        tap(() => {
          this.isAuthenticatedSubject.next(false);
          if (this.isBrowser) {
            localStorage.removeItem(this.AUTH_STORAGE_KEY);
          }
        })
      );
  }

  checkAuth(): void {
    this.http.get(`${this.apiUrl}/me`, { withCredentials: true })
      .subscribe({
        next: (response: any) => {
          const wasAuthenticated = this.isAuthenticatedSubject.value;
          
          if (response.ok) {
            // Only update if different (prevents unnecessary change detection triggers)
            if (!wasAuthenticated) {
              this.isAuthenticatedSubject.next(true);
            }
            if (this.isBrowser) {
              localStorage.setItem(this.AUTH_STORAGE_KEY, 'true');
            }
          } else {
            // Session expired - update state and clear localStorage
            if (wasAuthenticated) {
              this.isAuthenticatedSubject.next(false);
            }
            if (this.isBrowser) {
              localStorage.removeItem(this.AUTH_STORAGE_KEY);
            }
          }
          // Don't update authCheckComplete here - it's already set to true in constructor
        },
        error: () => {
          // Server error - if we thought we were authenticated, clear it
          const wasAuthenticated = this.isAuthenticatedSubject.value;
          if (wasAuthenticated && this.isBrowser) {
            // Only update if we were authenticated (localStorage said yes but server says no)
            this.isAuthenticatedSubject.next(false);
            localStorage.removeItem(this.AUTH_STORAGE_KEY);
          }
          // Don't update authCheckComplete here - it's already set to true in constructor
        }
      });
  }
}

