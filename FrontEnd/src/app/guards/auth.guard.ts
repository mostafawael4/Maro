import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

/**
 * Allows both admin and editor to access routes.
 * Redirects unauthenticated users to login page.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // Check immediate auth state (from localStorage)
  if (!authService.isAuthenticatedValue) {
    router.navigate(['/admin']);
    return false;
  }

  // Verify with server
  return authService.isAuthenticated$.pipe(
    take(1),
    map(isAuthenticated => {
      if (!isAuthenticated) {
        router.navigate(['/admin']);
        return false;
      }
      return true;
    })
  );
};

