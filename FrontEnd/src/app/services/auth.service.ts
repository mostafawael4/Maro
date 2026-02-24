import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

type UserRole = 'admin' | 'editor' | null;

interface SessionInfo {
  isAdmin?: boolean;
  isEditor?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/admin`;
  private isBrowser: boolean;
  private currentRole: UserRole = null;

  private isAuthenticatedSubject = new BehaviorSubject<boolean | null>(null);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();
  private roleSubject = new BehaviorSubject<UserRole>(null);
  public role$ = this.roleSubject.asObservable();

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(platformId);
    if (this.isBrowser) {
      Promise.resolve().then(() => this.checkAuth());
    } else {
      this.isAuthenticatedSubject.next(null);
    }
  }

  get isAuthenticatedValue(): boolean {
    return this.isAuthenticatedSubject.value === true;
  }

  get authStateSnapshot(): boolean | null {
    return this.isAuthenticatedSubject.value;
  }

  get isBrowserEnv(): boolean {
    return this.isBrowser;
  }

  login(username: string, password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { username, password }, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response?.ok) {
            // Store session ID in localStorage if provided (iOS fallback)
            if (response.sessionId && this.isBrowser) {
              localStorage.setItem('maro_session_id', response.sessionId);
            }
            this.markAuthenticated(response.session);
          } else {
            this.handleSessionExpired();
          }
        })
      );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true })
      .pipe(
        tap(() => {
          this.handleSessionExpired();
        })
      );
  }

  isAdmin(): boolean {
    return this.currentRole === 'admin';
  }

  isEditor(): boolean {
    return this.currentRole === 'editor';
  }

  getUserRole(): UserRole {
    return this.currentRole;
  }

  get roleSnapshot(): UserRole {
    return this.roleSubject.value;
  }

  handleSessionExpired(): void {
    this.currentRole = null;
    if (this.isBrowser) {
      localStorage.removeItem('maro_session_id');
    }
    if (this.isAuthenticatedSubject.value !== false) {
      this.isAuthenticatedSubject.next(false);
    }
  }

  private isChecking = false;

  checkAuth(force: boolean = false): void {
    if (!this.isBrowser) {
      return;
    }

    // If already authenticated and not forced, skip check
    // This prevents a race condition on mobile right after login
    if (this.isAuthenticatedValue && !force) {
      return;
    }

    // Don't start another check if one is already in progress
    if (this.isChecking) {
      return;
    }

    this.isChecking = true;
    this.http.get(`${this.apiUrl}/me`, { withCredentials: true })
      .subscribe({
        next: (response: any) => {
          this.isChecking = false;
          if (response?.ok) {
            // Update session ID if returned (though me doesn't usually return it, 
            // the interceptor will use the one we have)
            this.markAuthenticated(response.session);
          } else {
            this.handleSessionExpired();
          }
        },
        error: () => {
          this.isChecking = false;
          this.handleSessionExpired();
        }
      });
  }

  private setRoleFromSession(session?: SessionInfo): void {
    if (session?.isAdmin) {
      this.currentRole = 'admin';
    } else if (session?.isEditor) {
      this.currentRole = 'editor';
    } else {
      this.currentRole = null;
    }
    this.roleSubject.next(this.currentRole);
  }

  private markAuthenticated(session?: SessionInfo): void {
    this.setRoleFromSession(session);
    if (this.isAuthenticatedSubject.value !== true) {
      this.isAuthenticatedSubject.next(true);
    }
  }

  changePassword(payload: { username: string; oldPassword: string; newPassword: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/change-password`, payload, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response?.session) {
            this.setRoleFromSession(response.session);
          }
        })
      );
  }
}


