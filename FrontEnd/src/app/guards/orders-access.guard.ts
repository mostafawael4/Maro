import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';

import { AuthService } from '../services/auth.service';

/**
 * Allows public clients to view the orders page (for email lookup) but blocks
 * authenticated editors while allowing admins through.
 */
export const ordersAccessGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (!authService.isBrowserEnv) {
    return true;
  }

  const decide = (isAuthenticated: boolean) => {
    if (!isAuthenticated) {
      return true; // public client flow
    }

    if (authService.isAdmin()) {
      return true;
    }

    if (typeof window !== 'undefined') {
      window.alert('Authentication required. Please log in as admin to continue.');
    }
    router.navigate(['/admin']);
    return false;
  };

  authService.checkAuth();

  const snapshot = authService.authStateSnapshot;
  if (snapshot !== null) {
    return decide(snapshot);
  }

  return authService.isAuthenticated$.pipe(
    filter((value): value is boolean => value !== null),
    take(1),
    map(decide)
  );
};

