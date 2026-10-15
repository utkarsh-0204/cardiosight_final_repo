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

  return auth.validateSession().pipe(
    map((isValid) => {
      if (isValid) {
        return true;
      }
      toast.warning('Session expired', 'Please log in to continue.');
      return router.createUrlTree(['/auth/login'], {
        queryParams: { returnUrl: state.url },
      });
    }),
  );
};
