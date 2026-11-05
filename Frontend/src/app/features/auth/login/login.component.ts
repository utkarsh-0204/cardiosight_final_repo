// =============================================================================
// Login page – Clean, minimal enterprise healthcare SaaS
// Reference: Linear, Stripe, Apple
// =============================================================================
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIf } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../../core/services/auth.service';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    NgIf,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatCheckboxModule,
    MatButtonModule,
  ],
  template: `
    <div class="login-page">
      <div class="login-card">
        <!-- Understated Brand Header -->
        <a class="brand" routerLink="/landing" aria-label="CardioSight Home">
          <span class="brand-icon">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path
                d="M3 17h5l2.5-6 4 10 3-7 2 3h5.5"
                fill="none"
                stroke="#F8FAFC"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
              <circle cx="27" cy="6" r="2.8" fill="#F06464" />
            </svg>
          </span>
          <span class="brand-title">Cardio<span>Sight</span></span>
        </a>

        <div class="card-intro">
          <h1 class="card-heading">Sign in</h1>
          <p class="card-caption">Enter your credentials to access your account.</p>
        </div>

        <!-- Inline Error Alert (Minimal) -->
        <div class="error-notice" *ngIf="errorMessage()" role="alert">
          <mat-icon class="notice-icon">error_outline</mat-icon>
          <span class="notice-text">{{ errorMessage() }}</span>
        </div>

        <!-- Form -->
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="login-form" novalidate>
          <div class="field-group">
            <label for="email" class="field-label">Email</label>
            <mat-form-field appearance="outline" class="minimal-field" subscriptSizing="dynamic">
              <input
                id="email"
                matInput
                type="email"
                formControlName="email"
                placeholder="name@example.com"
                autocomplete="email"
                [disabled]="submitting() || authSuccess()"
                (input)="onInputChange()"
              />
            </mat-form-field>
            <div
              class="field-error"
              *ngIf="form.controls.email.invalid && (form.controls.email.dirty || form.controls.email.touched)"
            >
              <span *ngIf="form.controls.email.hasError('required')">Email is required</span>
              <span *ngIf="form.controls.email.hasError('email')">Please enter a valid email</span>
            </div>
          </div>

          <div class="field-group">
            <div class="label-split">
              <label for="password" class="field-label">Password</label>
              <a routerLink="/auth/forgot-password" class="subtle-link">Forgot password?</a>
            </div>
            <mat-form-field appearance="outline" class="minimal-field" subscriptSizing="dynamic">
              <input
                id="password"
                matInput
                [type]="showPassword() ? 'text' : 'password'"
                formControlName="password"
                placeholder="••••••••"
                autocomplete="current-password"
                [disabled]="submitting() || authSuccess()"
                (input)="onInputChange()"
              />
              <button
                mat-icon-button
                matSuffix
                type="button"
                class="pwd-toggle"
                (click)="togglePassword()"
                [attr.aria-label]="showPassword() ? 'Hide password' : 'Show password'"
                [disabled]="submitting() || authSuccess()"
                tabindex="-1"
              >
                <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>
            <div
              class="field-error"
              *ngIf="form.controls.password.invalid && (form.controls.password.dirty || form.controls.password.touched)"
            >
              <span *ngIf="form.controls.password.hasError('required')">Password is required</span>
              <span *ngIf="form.controls.password.hasError('minlength')">Must be at least 6 characters</span>
            </div>
          </div>

          <div class="remember-row">
            <mat-checkbox
              formControlName="rememberMe"
              color="primary"
              class="minimal-checkbox"
              [disabled]="submitting() || authSuccess()"
            >
              Remember me
            </mat-checkbox>
          </div>

          <!-- Primary Submit Button -->
          <button
            mat-flat-button
            type="submit"
            class="submit-btn"
            [disabled]="submitting() || authSuccess() || form.invalid"
          >
            @if (authSuccess()) {
              <span class="btn-label">
                <mat-icon class="btn-check">check</mat-icon>
                <span>Welcome back</span>
              </span>
            } @else if (submitting()) {
              <span class="btn-label">
                <span class="inline-spinner" aria-hidden="true"></span>
                <span>Signing in…</span>
              </span>
            } @else {
              <span>Sign in</span>
            }
          </button>
        </form>

        <!-- Compact Demo Access -->
        <div class="demo-access">
          <span class="demo-label">Try demo account:</span>
          <button
            type="button"
            class="demo-chip"
            (click)="populateDemo('patient')"
            [disabled]="submitting() || authSuccess()"
          >
            Patient
          </button>
          <span class="demo-pipe">|</span>
          <button
            type="button"
            class="demo-chip"
            (click)="populateDemo('admin')"
            [disabled]="submitting() || authSuccess()"
          >
            Admin
          </button>
        </div>

        <!-- Switch to Sign up -->
        <div class="footer-switch">
          <span>Don't have an account?</span>
          <a routerLink="/auth/register" class="link-register">Create one</a>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        width: 100%;
        background-color: #0B1020;
        color: #F8FAFC;
        font-family: var(--font-sans);
      }

      .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 16px;
        background-color: #0B1020;
      }

      /* Compact, proportioned login card */
      .login-card {
        width: 100%;
        max-width: 390px;
        background-color: #121829;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 14px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        padding: 32px 28px 28px;
        display: flex;
        flex-direction: column;
      }

      /* Brand mark */
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 9px;
        text-decoration: none;
        align-self: flex-start;
        margin-bottom: 20px;
      }

      .brand-icon {
        width: 28px;
        height: 28px;
        border-radius: 7px;
        background-color: #1A2238;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;

        svg {
          width: 18px;
          height: 18px;
        }
      }

      .brand-title {
        font-size: 15px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #F8FAFC;

        span {
          color: #F06464;
        }
      }

      .card-intro {
        margin-bottom: 20px;
      }

      .card-heading {
        font-size: 20px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: #F8FAFC;
        margin: 0 0 4px;
      }

      .card-caption {
        font-size: 13px;
        color: #94A3B8;
        margin: 0;
        line-height: 1.45;
      }

      /* Error Alert */
      .error-notice {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        border-radius: 8px;
        background-color: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #FCA5A5;
        font-size: 12.5px;
        margin-bottom: 16px;
      }

      .notice-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
        color: #EF4444;
        flex-shrink: 0;
      }

      .notice-text {
        flex: 1;
        line-height: 1.4;
      }

      /* Form */
      .login-form {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .field-group {
        display: flex;
        flex-direction: column;
        gap: 5px;
      }

      .field-label {
        font-size: 12.5px;
        font-weight: 500;
        color: #CBD5E1;
      }

      .label-split {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .subtle-link {
        font-size: 12px;
        color: #94A3B8;
        text-decoration: none;

        &:hover,
        &:focus-visible {
          color: #F06464;
          text-decoration: underline;
        }
      }

      /* Minimal Angular Material Field */
      ::ng-deep .minimal-field {
        width: 100%;

        .mat-mdc-text-field-wrapper {
          background-color: rgba(255, 255, 255, 0.03) !important;
          border-radius: 8px !important;
          padding: 0 12px !important;
          height: 40px !important;
        }

        .mat-mdc-form-field-flex {
          height: 40px !important;
          align-items: center !important;
        }

        .mdc-notched-outline__leading,
        .mdc-notched-outline__notch,
        .mdc-notched-outline__trailing {
          border-color: rgba(255, 255, 255, 0.12) !important;
          border-width: 1px !important;
        }

        &.mat-focused {
          .mdc-notched-outline__leading,
          .mdc-notched-outline__notch,
          .mdc-notched-outline__trailing {
            border-color: #F06464 !important;
            border-width: 1px !important;
          }
        }

        input.mat-mdc-input-element {
          color: #F8FAFC !important;
          font-size: 13.5px !important;
          caret-color: #F06464 !important;

          &::placeholder {
            color: #64748B !important;
          }
        }
      }

      .pwd-toggle {
        width: 28px;
        height: 28px;
        color: #64748B;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: -4px;

        &:hover {
          color: #CBD5E1;
        }

        mat-icon {
          font-size: 18px;
          width: 18px;
          height: 18px;
        }
      }

      .field-error {
        font-size: 11.5px;
        color: #F87171;
        padding-left: 1px;
      }

      .remember-row {
        margin: 2px 0 4px;
      }

      ::ng-deep .minimal-checkbox {
        .mdc-form-field {
          font-size: 12.5px;
          color: #94A3B8;
        }

        .mdc-checkbox .mdc-checkbox__native-control:enabled:checked ~ .mdc-checkbox__background {
          background-color: #F06464 !important;
          border-color: #F06464 !important;
        }
      }

      /* Primary Button (Restrained Coral #F06464, flat, no gradients, no glows) */
      .submit-btn {
        width: 100%;
        height: 40px;
        border-radius: 8px;
        font-size: 13.5px;
        font-weight: 500;
        letter-spacing: 0;
        background-color: #F06464 !important;
        color: #FFFFFF !important;
        border: none;
        transition: background-color 0.15s ease;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;

        &:hover:not([disabled]) {
          background-color: #E05353 !important;
        }

        &[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .btn-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }

      .btn-check {
        font-size: 17px;
        width: 17px;
        height: 17px;
      }

      .inline-spinner {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.35);
        border-top-color: #FFFFFF;
        animation: spin 0.6s linear infinite;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* Demo Access (Compact & Unobtrusive) */
      .demo-access {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        margin-top: 18px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.06);
        font-size: 12px;
      }

      .demo-label {
        color: #64748B;
      }

      .demo-chip {
        background: transparent;
        border: none;
        color: #94A3B8;
        font-size: 12px;
        font-weight: 500;
        padding: 2px 4px;
        cursor: pointer;
        text-decoration: underline;
        text-underline-offset: 3px;
        text-decoration-color: rgba(255, 255, 255, 0.2);
        transition: color 0.15s ease;

        &:hover:not([disabled]) {
          color: #F8FAFC;
          text-decoration-color: #F8FAFC;
        }

        &[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
      }

      .demo-pipe {
        color: #475569;
        font-size: 11px;
      }

      /* Sign up switch */
      .footer-switch {
        margin-top: 14px;
        text-align: center;
        font-size: 12.5px;
        color: #94A3B8;

        span {
          margin-right: 5px;
        }
      }

      .link-register {
        color: #F06464;
        text-decoration: none;
        font-weight: 500;

        &:hover {
          text-decoration: underline;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .inline-spinner {
          animation: none;
        }
        .submit-btn {
          transition: none;
        }
      }
    `,
  ],
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly submitting = signal(false);
  readonly authSuccess = signal(false);
  readonly showPassword = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [false],
  });

  togglePassword(): void {
    this.showPassword.update((v) => !v);
  }

  onInputChange(): void {
    if (this.errorMessage()) {
      this.errorMessage.set(null);
    }
  }

  populateDemo(role: 'patient' | 'admin'): void {
    this.errorMessage.set(null);
    if (role === 'admin') {
      this.form.patchValue({
        email: 'admin@cardiosight.local',
        password: 'Admin@12345',
        rememberMe: true,
      });
    } else {
      this.form.patchValue({
        email: 'aarav.sharma@demo.com',
        password: 'Password@123',
        rememberMe: true,
      });
    }
    this.form.markAllAsTouched();
    this.form.updateValueAndValidity();
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting() || this.authSuccess()) return;

    this.errorMessage.set(null);
    this.submitting.set(true);

    const { email, password, rememberMe } = this.form.getRawValue();

    this.auth.login({ email, password, rememberMe }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.authSuccess.set(true);

        setTimeout(() => {
          const returnUrl = this.router.routerState.snapshot.root.queryParamMap.get('returnUrl');
          const defaultTarget = this.auth.isAdmin() ? '/app/admin' : '/app/dashboard';
          this.router.navigate([returnUrl ?? defaultTarget]);
        }, 1200);
      },
      error: (err) => {
        this.submitting.set(false);
        this.authSuccess.set(false);

        let errorText = 'Invalid email or password.';
        if (err.error?.message) {
          errorText = err.error.message;
        } else if (err.status === 0) {
          errorText = 'Unable to reach the server. Please check your network.';
        }
        this.errorMessage.set(errorText);
      },
    });
  }
}
