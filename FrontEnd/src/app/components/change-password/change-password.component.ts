import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { Subject, takeUntil } from 'rxjs';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './change-password.component.html',
  styleUrl: './change-password.component.scss'
})
export class ChangePasswordComponent implements OnInit, OnDestroy {
  readonly destroy$ = new Subject<void>();
  loading = false;
  successMessage = '';
  errorMessage = '';
  role: 'admin' | 'editor' | null = null;

  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService
  ) {
    this.form = this.fb.group({
      username: [{ value: '', disabled: true }, Validators.required],
      oldPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit(): void {
    const roleSnapshot = this.authService.roleSnapshot || this.authService.getUserRole();
    if (roleSnapshot) {
      this.setRole(roleSnapshot);
    } else {
      this.authService.checkAuth();
    }

    this.authService.role$
      .pipe(takeUntil(this.destroy$))
      .subscribe(role => {
        if (role) {
          this.setRole(role);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get usernameValue(): string {
    return this.form.get('username')?.value || '';
  }

  get newPasswordControl() {
    return this.form.get('newPassword');
  }

  onSubmit(): void {
    if (this.form.invalid || !this.role) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading = true;
    this.errorMessage = '';
    this.successMessage = '';

    const payload = {
      username: this.role,
      oldPassword: this.form.getRawValue().oldPassword || '',
      newPassword: this.form.getRawValue().newPassword || '',
    };

    this.authService.changePassword(payload).subscribe({
      next: (response) => {
        if (response?.ok) {
          this.successMessage = response?.message || 'Password updated successfully.';
          this.form.get('oldPassword')?.reset();
          this.form.get('newPassword')?.reset();
        } else {
          this.errorMessage = response?.message || 'Unable to update password. Please try again.';
        }
        this.loading = false;
      },
      error: (err) => {
        this.errorMessage = err.error?.message || 'Unable to update password. Please try again.';
        this.loading = false;
      }
    });
  }

  private setRole(role: 'admin' | 'editor'): void {
    this.role = role;
    this.form.get('username')?.setValue(role);
  }
}


