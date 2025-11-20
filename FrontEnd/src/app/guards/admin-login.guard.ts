import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs';

/**
 * Prevents authenticated users from seeing the login page again.
 * If the user already has a valid session, redirect based on role:
 * - Admin -> /dashboard
 * - Editor -> /calendar
 */
export const adminLoginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticatedValue || authService.hasStoredAuth()) {
    // Redirect based on role
    if (authService.isAdmin()) {
      return router.createUrlTree(['/dashboard']);
    } else if (authService.isEditor()) {
      return router.createUrlTree(['/calendar']);
    }
    return router.createUrlTree(['/dashboard']); // Default fallback
  }

  if (!authService.isBrowserEnv) {
    return true;
  }

  authService.checkAuth();

  return authService.isAuthenticated$.pipe(
    map(isAuthenticated => {
      if (isAuthenticated) {
        // Redirect based on role
        if (authService.isAdmin()) {
          return router.createUrlTree(['/dashboard']);
        } else if (authService.isEditor()) {
          return router.createUrlTree(['/calendar']);
        }
        return router.createUrlTree(['/dashboard']); // Default fallback
      }
      return true;
    })
  );
};


