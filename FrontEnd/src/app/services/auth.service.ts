import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = `${environment.apiUrl}/admin`;
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(private http: HttpClient) {
    // Check if already authenticated on init
    this.checkAuth();
  }

  login(password: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/login`, { password }, { withCredentials: true })
      .pipe(
        tap((response: any) => {
          if (response.ok) {
            this.isAuthenticatedSubject.next(true);
          }
        })
      );
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiUrl}/logout`, {}, { withCredentials: true })
      .pipe(
        tap(() => {
          this.isAuthenticatedSubject.next(false);
        })
      );
  }

  checkAuth(): void {
    this.http.get(`${this.apiUrl}/me`, { withCredentials: true })
      .subscribe({
        next: (response: any) => {
          if (response.ok) {
            this.isAuthenticatedSubject.next(true);
          }
        },
        error: () => {
          this.isAuthenticatedSubject.next(false);
        }
      });
  }
}

