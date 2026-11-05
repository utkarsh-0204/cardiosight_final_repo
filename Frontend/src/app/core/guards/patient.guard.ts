// =============================================================================
// Patient-only guard: prevents administrative accounts from entering
// the clinical patient assessment workflow (e.g. /app/predict).
// =============================================================================
import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

export const patientOnlyGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const toast = inject(ToastService);

  if (auth.isAdmin()) {
    toast.info('Admin mode active', 'Administrators cannot create clinical predictions in the patient workflow.');
    router.navigate(['/app/admin']);
    return false;
  }

  return true;
};

