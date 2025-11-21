import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { filter, map, take } from 'rxjs/operators';

/**
 * Allows both admin and editor to access routes.
 * Redirects unauthenticated users to login page.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isBrowserEnv) {
    return true;
  }

  authService.checkAuth();

  return authService.isAuthenticated$.pipe(
    filter((value): value is boolean => value !== null),
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

