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
  private isAuthenticatedSubject = new BehaviorSubject<boolean|null>(null);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    // Instead of default false, start as null (still supports SSR)
    if (this.isBrowser) {
      const authState = this.readAuthFromStorage();
      // Emit true/false only if known, else stays null
      if (authState === true || authState === false) {
        this.isAuthenticatedSubject.next(authState);
      } else {
        this.isAuthenticatedSubject.next(null);
      }
      Promise.resolve().then(() => { this.checkAuth(true); });
    } else {
      // On server-side, value is null (so UI doesn't render unauthorized flash)
      this.isAuthenticatedSubject.next(null);
    }
  }

  // Synchronous getter for immediate access to auth state
  get isAuthenticatedValue(): boolean {
    return this.isAuthenticatedSubject.value === true;
  }

  get isBrowserEnv(): boolean {
    return this.isBrowser;
  }

  hasStoredAuth(): boolean {
    if (!this.isBrowser) {
      return false;
    }
    return this.readAuthFromStorage();
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { username, password }, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response.ok) {
            this.isAuthenticatedSubject.next(true);
            if (this.isBrowser) {
              if (response?.session?.isAdmin) {
                // User is admin
                localStorage.setItem(this.AUTH_STORAGE_KEY, 'true');
              } else if (response?.session?.isEditor) {
                // User is editor
                localStorage.setItem(this.AUTH_STORAGE_KEY, 'false');
              } else {
                // Not logged in or unknown role
                localStorage.setItem(this.AUTH_STORAGE_KEY, 'null');
              }
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

  checkAuth(isInitial = false): void {
    this.http.get(`${this.apiUrl}/me`, { withCredentials: true })
      .subscribe({
        next: (response: any) => {
          if (response.ok) {
            if (this.isAuthenticatedSubject.value !== true) {
              this.isAuthenticatedSubject.next(true);
            }
            if (this.isBrowser) {
              localStorage.setItem(this.AUTH_STORAGE_KEY, 'true');
            }
          } else {
            if (this.isAuthenticatedSubject.value !== false) {
              this.isAuthenticatedSubject.next(false);
            }
            if (this.isBrowser) {
              localStorage.removeItem(this.AUTH_STORAGE_KEY);
            }
          }
        },
        error: () => {
          if (this.isAuthenticatedSubject.value !== false) {
            this.isAuthenticatedSubject.next(false);
          }
          if (this.isBrowser) {
            localStorage.removeItem(this.AUTH_STORAGE_KEY);
          }
        }
      });
  }
}

