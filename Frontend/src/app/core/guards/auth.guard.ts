// =============================================================================
// Route guard – blocks protected pages until the user is authenticated.
// =============================================================================
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  const hadToken = Boolean(auth.accessToken());

  return auth.validateSession().pipe(
    map((isValid) => {
      if (isValid) {
        return true;
      }
      // Only display session expired warning if the user previously possessed an active token
      // that is no longer valid. Never display this to unauthenticated visitors or clean logouts.
      if (hadToken) {
        toast.warning('Session expired', 'Your session has ended. Please sign in again.');
      }
      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      });
    }),
  );
};
