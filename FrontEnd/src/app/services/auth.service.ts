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

  handleSessionExpired(): void {
    this.currentRole = null;
    if (this.isAuthenticatedSubject.value !== false) {
      this.isAuthenticatedSubject.next(false);
    }
  }

  checkAuth(): void {
    if (!this.isBrowser) {
      return;
    }

    this.http.get(`${this.apiUrl}/me`, { withCredentials: true })
      .subscribe({
        next: (response: any) => {
          if (response?.ok) {
            this.markAuthenticated(response.session);
          } else {
            this.handleSessionExpired();
          }
        },
        error: () => {
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
  }

  private markAuthenticated(session?: SessionInfo): void {
    this.setRoleFromSession(session);
    if (this.isAuthenticatedSubject.value !== true) {
      this.isAuthenticatedSubject.next(true);
    }
  }
}


