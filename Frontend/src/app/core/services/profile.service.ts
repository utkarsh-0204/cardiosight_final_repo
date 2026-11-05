// =============================================================================
// Profile service – profile CRUD + password change.
// =============================================================================
import { Injectable, inject } from '@angular/core';
import { delay, Observable, of, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MOCK_USER } from '../data/mock-data';
import type { User } from '../models/user.model';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  /** GET /api/profile */
  getProfile(): Observable<User> {
    if (environment.useMock) {
      return of(this.auth.currentUser() ?? MOCK_USER).pipe(delay(environment.mockDelay * 0.5));
    }
    return this.api.get<User>('/profile');
  }

  /** PUT /api/profile */
  updateProfile(payload: Partial<User>): Observable<User> {
    if (environment.useMock) {
      const current = this.auth.currentUser() ?? MOCK_USER;
      const updated: User = { ...current, ...payload };
      return of(updated).pipe(
        delay(environment.mockDelay),
        tap(() => this.auth.updateStoredUser(updated)),
      );
    }
    return this.api
      .put<User>('/profile', payload)
      .pipe(tap((user) => this.auth.updateStoredUser(user)));
  }

  /** PUT /api/profile/password */
  changePassword(payload: ChangePasswordRequest): Observable<{ message: string }> {
    if (environment.useMock) {
      return of({ message: 'Password changed successfully.' }).pipe(delay(environment.mockDelay * 0.7));
    }
    return this.api.put<{ message: string }>('/profile/password', payload);
  }

  /** Computes a body-mass-index value from the user's stored metrics. */
  bmiFor(user: User): number {
    if (!user.heightCm || !user.weightKg || user.heightCm <= 0 || user.weightKg <= 0) return 0;
    const heightM = user.heightCm / 100;
    if (!heightM) return 0;
    return Math.round((user.weightKg / (heightM * heightM)) * 10) / 10;
  }
}
