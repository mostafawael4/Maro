import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, take } from 'rxjs/operators';

/**
 * Prevents authenticated users from seeing the login page again.
 * If the user already has a valid session, redirect based on role:
 * - Admin -> /dashboard
 * - Editor -> /calendar
 */
export const adminLoginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const redirectForRole = () => {
    if (authService.isAdmin()) {
      return router.createUrlTree(['/dashboard']);
    }
    if (authService.isEditor()) {
      return router.createUrlTree(['/calendar']);
    }
    return router.createUrlTree(['/dashboard']);
  };

  if (authService.isAuthenticatedValue) {
    return redirectForRole();
  }

  if (!authService.isBrowserEnv) {
    return true;
  }

  authService.checkAuth();

  return authService.isAuthenticated$.pipe(
    filter((value): value is boolean => value !== null),
    take(1),
    map(isAuthenticated => (isAuthenticated ? redirectForRole() : true))
  );
};


