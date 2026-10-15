// =============================================================================
// Authentication service. Manages JWT tokens + current user with signals.
// Switches to realistic mock responses when environment.useMock is enabled.
// =============================================================================
import { computed, Injectable, inject, signal } from '@angular/core';
import { catchError, delay, map, Observable, of, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { MOCK_ADMIN, MOCK_USER } from '../data/mock-data';
import type {
  AuthResponse,
  ForgotPasswordRequest,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
  VerifyEmailRequest,
} from '../models/auth.model';
import type { User } from '../models/user.model';
import { ApiService } from './api.service';

const TOKEN_KEY = 'cardiosight_token';
const USER_KEY = 'cardiosight_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);

  private readonly user = signal<User | null>(this.loadStoredUser());
  private readonly token = signal<string | null>(this.loadStoredToken());

  readonly currentUser = this.user.asReadonly();
  readonly accessToken = this.token.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly fullName = computed(() => {
    const u = this.user();
    return u ? `${u.firstName} ${u.lastName}` : '';
  });

  /** POST /api/auth/login */
  login(credentials: LoginRequest): Observable<AuthResponse> {
    if (environment.useMock) {
      const isAdmin = credentials.email.toLowerCase().includes('admin');
      const user = isAdmin ? MOCK_ADMIN : MOCK_USER;
      return of(this.buildAuthResponse(user)).pipe(
        delay(environment.mockDelay),
        tap((res) => this.persist(res)),
      );
    }
    return this.api
      .post<AuthResponse>('/auth/login', credentials)
      .pipe(tap((res) => this.persist(res)));
  }

  /** POST /api/auth/register */
  register(payload: RegisterRequest): Observable<AuthResponse> {
    if (environment.useMock) {
      const user: User = {
        ...MOCK_USER,
        id: `usr_${Date.now().toString(36)}`,
        firstName: payload.firstName,
        lastName: payload.lastName,
        email: payload.email,
        phone: payload.phone ?? '',
        gender: payload.gender ?? 'male',
        isEmailVerified: false,
        createdAt: new Date().toISOString(),
      };
      return of(this.buildAuthResponse(user)).pipe(
        delay(environment.mockDelay),
        tap((res) => this.persist(res)),
      );
    }
    return this.api.post<AuthResponse>('/auth/register', payload).pipe(tap((res) => this.persist(res)));
  }

  /** POST /api/auth/forgot-password */
  forgotPassword(payload: ForgotPasswordRequest): Observable<{ message: string }> {
    if (environment.useMock) {
      return of({ message: `Reset link sent to ${payload.email}` }).pipe(delay(environment.mockDelay));
    }
    return this.api.post<{ message: string }>('/auth/forgot-password', payload);
  }

  /** POST /api/auth/reset-password */
  resetPassword(payload: ResetPasswordRequest): Observable<{ message: string }> {
    if (environment.useMock) {
      return of({ message: 'Password has been reset successfully.' }).pipe(delay(environment.mockDelay));
    }
    return this.api.post<{ message: string }>('/auth/reset-password', payload);
  }

  /** POST /api/auth/verify-email */
  verifyEmail(payload: VerifyEmailRequest): Observable<{ message: string }> {
    if (environment.useMock) {
      return of({ message: 'Email verified successfully.' }).pipe(delay(environment.mockDelay));
    }
    return this.api.post<{ message: string }>('/auth/verify-email', payload);
  }

  /** GET /api/auth/me – refreshes the stored user from the server. */
  refreshProfile(): Observable<User> {
    if (environment.useMock) {
      return of(this.user() ?? MOCK_USER).pipe(
        delay(environment.mockDelay),
        tap((user) => this.updateStoredUser(user)),
      );
    }
    return this.api.get<User>('/auth/me').pipe(tap((user) => this.updateStoredUser(user)));
  }

  /** Updates the in-memory + stored user (used by the profile page). */
  updateStoredUser(user: User): void {
    this.user.set(user);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private sessionValidated = false;

  /** Validates the current token against the backend (/api/auth/me) */
  validateSession(force = false): Observable<boolean> {
    if (environment.useMock) {
      return of(this.isAuthenticated());
    }

    const token = this.token();
    if (!token) {
      this.logout();
      return of(false);
    }

    if (this.sessionValidated && !force && this.user()) {
      return of(true);
    }

    return this.refreshProfile().pipe(
      map((user) => {
        this.sessionValidated = true;
        return Boolean(user);
      }),
      catchError(() => {
        this.logout();
        return of(false);
      }),
    );
  }

  logout(): void {
    this.sessionValidated = false;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
    this.token.set(null);
  }

  private buildAuthResponse(user: User): AuthResponse {
    const payload = btoa(JSON.stringify({ sub: user.id, role: user.role }));
    return {
      tokens: {
        accessToken: `mock-jwt.${payload}.${Math.random().toString(36).slice(2)}`,
        tokenType: 'Bearer',
        expiresIn: 86400,
      },
      user,
    };
  }

  private persist(response: AuthResponse): void {
    this.sessionValidated = true;
    localStorage.setItem(TOKEN_KEY, response.tokens.accessToken);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));
    this.token.set(response.tokens.accessToken);
    this.user.set(response.user);
  }

  private loadStoredToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  private loadStoredUser(): User | null {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}
