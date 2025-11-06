import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
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
export class AdminComponent implements OnInit {
  password: string = '';
  errorMessage: string = '';
  isLoading: boolean = false;
  isAuthenticated: boolean = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check if already authenticated
    this.authService.isAuthenticated$.subscribe(isAuth => {
      this.isAuthenticated = isAuth;
    });
  }

  onSubmit(): void {
    if (!this.password.trim()) {
      this.errorMessage = 'Please enter a password';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    this.authService.login(this.password).subscribe({
      next: (response) => {
        if (response.ok) {
          this.isLoading = false;
          // Successfully logged in - you can redirect to admin dashboard
          console.log('Logged in successfully');
          this.isAuthenticated = true;
        }
      },
      error: (error) => {
        this.isLoading = false;
        this.errorMessage = error.error?.message || 'Invalid password. Please try again.';
        this.password = '';
      }
    });
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

