import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map } from 'rxjs';

/**
 * Prevents authenticated admins from seeing the login page again.
 * If the user already has a valid session, redirect straight to the dashboard.
 */
export const adminLoginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticatedValue || authService.hasStoredAuth()) {
    return router.createUrlTree(['/dashboard']);
  }

  if (!authService.isBrowserEnv) {
    return true;
  }

  authService.checkAuth();

  return authService.isAuthenticated$.pipe(
    map(isAuthenticated => {
      if (isAuthenticated) {
        return router.createUrlTree(['/dashboard']);
      }
      return true;
    })
  );
};


