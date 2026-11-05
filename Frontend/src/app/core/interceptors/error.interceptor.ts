// =============================================================================
// HTTP interceptor – normalizes backend errors and surfaces them as toasts.
// =============================================================================
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let message = 'Something went wrong. Please try again.';

      if (error.error?.message) {
        message = error.error.message;
      } else if (typeof error.error === 'string' && error.error.length > 0) {
        message = error.error;
      } else if (error.status === 0) {
        message = 'Unable to reach the server. Check your connection.';
      } else if (error.status >= 500) {
        message = 'Server error. Our team has been notified.';
      }

      if (error.status === 401) {
        const isAuthEndpoint = req.url.includes('/auth/login') || req.url.includes('/auth/register');
        if (!isAuthEndpoint) {
          const hadSession = Boolean(auth.accessToken());
          auth.logout();
          router.navigate(['/auth/login'], {
            queryParams: { returnUrl: router.routerState.snapshot.url },
          });
          if (hadSession) {
            toast.error('Session expired', message || 'Your session has expired. Please log in again.');
          }
          return throwError(() => error);
        }
        toast.error('Authentication failed', message);
        return throwError(() => error);
      }

      toast.error('Request failed', message);
      return throwError(() => error);
    }),
  );
};
