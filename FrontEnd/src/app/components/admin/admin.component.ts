import { Component, OnInit, AfterViewInit, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.scss'
})
export class AdminComponent implements OnInit, AfterViewInit {
  username: string = '';
  password: string = '';
  errorMessage: string = '';
  isLoading: boolean = false;
  isAuthenticated: boolean = false;
  isClientReady: boolean = false; // Hide content until client-side is ready
  showPassword = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    // In browser: get auth state immediately and mark as ready
    // This prevents SSR flash because we have the correct state from localStorage
    if (isPlatformBrowser(this.platformId)) {
      this.isAuthenticated = this.authService.isAuthenticatedValue;
      // Mark as ready immediately since we have the correct auth state
      this.isClientReady = true;
    }
    // On server: isClientReady stays false, so nothing renders (prevents SSR mismatch)
  }

  ngOnInit(): void {
    // Subscribe to auth changes
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth ?? false;

      if (this.isAuthenticated && isPlatformBrowser(this.platformId)) {
        // Redirect based on role
        if (this.authService.isAdmin()) {
          this.router.navigate(['/dashboard']);
        } else if (this.authService.isEditor()) {
          this.router.navigate(['/calendar']);
        } else {
          this.router.navigate(['/dashboard']); // Default fallback
        }
      }
    });
  }

  ngAfterViewInit(): void {
    // Fallback: ensure isClientReady is set if we're in browser
    // This handles edge cases where constructor check might have failed
    if (isPlatformBrowser(this.platformId) && !this.isClientReady) {
      this.isClientReady = true;
      if (this.isAuthenticated) {
        // Redirect based on role
        if (this.authService.isAdmin()) {
          this.router.navigate(['/dashboard']);
        } else if (this.authService.isEditor()) {
          this.router.navigate(['/calendar']);
        } else {
          this.router.navigate(['/dashboard']); // Default fallback
        }
      }
    }
  }

  onSubmit(): void {
    const trimmedUsername = this.username.trim();
    const trimmedPassword = this.password.trim();

    if (!trimmedUsername || !trimmedPassword) {
      this.errorMessage = 'Please enter both username and password';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(trimmedUsername, trimmedPassword).subscribe({
      next: (response) => {
        if (response.ok) {
          // Slight delay before redirecting to allow mobile browsers to settle cookie storage
          setTimeout(() => {
            this.isLoading = false;
            // Redirect based on role after successful login
            if (response?.session?.isAdmin) {
              this.router.navigate(['/dashboard']);
            } else if (response?.session?.isEditor) {
              this.router.navigate(['/calendar']);
            } else {
              this.router.navigate(['/']); // Default fallback
            }
          }, 150);
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Invalid password. Please try again.';
        this.password = '';
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onLogout(): void {
    this.authService.logout().subscribe({
      next: () => {
        this.isAuthenticated = false;
        this.password = '';
      },
      error: (error) => {
        console.error('Logout error:', error);
      }
    });
  }

  closeModal(): void {
    // Navigate back to home if user closes the modal
    this.router.navigate(['/home']);
  }
}

