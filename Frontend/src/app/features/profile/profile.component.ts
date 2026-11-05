// =============================================================================
// Profile page – personal details, health metrics, security (password change).
// =============================================================================
import { Component, computed, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBarModule, MatSnackBar } from '@angular/material/snack-bar';
import { finalize, Subscription } from 'rxjs';
import { ProfileService } from '../../core/services/profile.service';
import { AuthService } from '../../core/services/auth.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { CircularProgressComponent } from '../../shared/components/circular-progress/circular-progress.component';
import type { User } from '../../core/models/user.model';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.scss',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatSnackBarModule,
    AvatarComponent,
    CircularProgressComponent,
  ],
})
export class ProfileComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly profile = inject(ProfileService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly snackbar = inject(MatSnackBar);

  readonly user = signal<User | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly changingPassword = signal(false);

  // Password visibility controls
  readonly hideCurrentPassword = signal(true);
  readonly hideNewPassword = signal(true);
  readonly hideConfirmPassword = signal(true);

  // Prevent selecting future dates as date of birth
  readonly maxDate = new Date().toISOString().split('T')[0];

  readonly profileForm = this.fb.group({
    firstName: ['', [Validators.required]],
    lastName: ['', [Validators.required]],
    email: [{ value: '', disabled: true }, [Validators.required, Validators.email]],
    phone: [''],
    gender: ['male' as 'male' | 'female' | 'other'],
    dateOfBirth: [''],
    heightCm: [null as number | null, [Validators.min(50), Validators.max(250)]],
    weightKg: [null as number | null, [Validators.min(20), Validators.max(300)]],
    bloodGroup: [''],
    allergies: [''],
    medications: [''],
    medicalConditions: [''],
  });

  private readonly formValues = signal(this.profileForm.getRawValue());
  private valueChangesSub?: Subscription;

  readonly passwordForm = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
    },
    {
      validators: (g) =>
        g.get('newPassword')?.value === g.get('confirmPassword')?.value ? null : { mismatch: true },
    },
  );

  /**
   * Reactively computes BMI from form inputs as the user types.
   * If either height or weight is missing, zero, or invalid, returns null.
   */
  readonly bmi = computed<number | null>(() => {
    const vals = this.formValues();
    const h = vals.heightCm != null && vals.heightCm !== ('' as any) ? Number(vals.heightCm) : null;
    const w = vals.weightKg != null && vals.weightKg !== ('' as any) ? Number(vals.weightKg) : null;
    if (!h || !w || h <= 0 || w <= 0 || isNaN(h) || isNaN(w)) {
      return null;
    }
    const heightM = h / 100;
    const val = w / (heightM * heightM);
    if (!isFinite(val) || val <= 0) return null;
    return Math.round(val * 10) / 10;
  });

  readonly bmiLevel = computed(() => {
    const b = this.bmi();
    if (b === null) {
      return {
        label: 'Not available',
        cls: 'neutral',
        color: 'var(--text-tertiary)',
        message: 'Enter valid height & weight to calculate',
      };
    }
    if (b >= 30) return { label: 'Obese', cls: 'high', color: '#E53935', message: 'Based on your height & weight' };
    if (b >= 25) return { label: 'Overweight', cls: 'medium', color: '#F9A825', message: 'Based on your height & weight' };
    if (b < 18.5) return { label: 'Underweight', cls: 'medium', color: '#F9A825', message: 'Based on your height & weight' };
    return { label: 'Healthy', cls: 'low', color: '#43A047', message: 'Based on your height & weight' };
  });

  readonly profileCompleteness = computed(() => {
    const u = this.user();
    if (!u) return 0;
    const checks = [
      Boolean(u.firstName?.trim() && u.lastName?.trim()),
      Boolean(u.phone?.trim()),
      Boolean(u.dateOfBirth),
      Boolean(u.bloodGroup?.trim()),
      Boolean(u.heightCm && u.heightCm > 0),
      Boolean(u.weightKg && u.weightKg > 0),
      Boolean(u.allergies && u.allergies.length > 0),
      Boolean(u.medicalConditions && u.medicalConditions.length > 0),
      Boolean(u.medications && u.medications.length > 0),
      Boolean(u.isEmailVerified),
    ];
    const filled = checks.filter(Boolean).length;
    return Math.round((filled / checks.length) * 100);
  });

  ngOnInit(): void {
    this.valueChangesSub = this.profileForm.valueChanges.subscribe(() => {
      this.formValues.set(this.profileForm.getRawValue());
    });

    this.profile.getProfile().subscribe({
      next: (u) => {
        this.user.set(u);
        this.patchForm(u);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load profile', 'Please try again.');
      },
    });
  }

  ngOnDestroy(): void {
    this.valueChangesSub?.unsubscribe();
  }

  patchForm(u: User): void {
    this.profileForm.patchValue({
      firstName: u.firstName || '',
      lastName: u.lastName || '',
      email: u.email || '',
      phone: u.phone || '',
      gender: u.gender || 'male',
      dateOfBirth: u.dateOfBirth || '',
      heightCm: u.heightCm && u.heightCm > 0 ? u.heightCm : null,
      weightKg: u.weightKg && u.weightKg > 0 ? u.weightKg : null,
      bloodGroup: u.bloodGroup || '',
      allergies: (u.allergies || []).join(', '),
      medications: (u.medications || []).join(', '),
      medicalConditions: (u.medicalConditions || []).join(', '),
    });
    this.formValues.set(this.profileForm.getRawValue());
  }

  toList(value: string | null | undefined): string[] {
    if (!value) return [];
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  saveProfile(): void {
    if (this.profileForm.invalid) return;
    const v = this.profileForm.getRawValue();
    const h = v.heightCm != null && (v.heightCm as any) !== '' && Number(v.heightCm) > 0 ? Number(v.heightCm) : null;
    const w = v.weightKg != null && (v.weightKg as any) !== '' && Number(v.weightKg) > 0 ? Number(v.weightKg) : null;

    const payload: Partial<User> = {
      firstName: (v.firstName || '').trim(),
      lastName: (v.lastName || '').trim(),
      phone: (v.phone || '').trim(),
      gender: (v.gender as any) || 'male',
      dateOfBirth: v.dateOfBirth || '',
      heightCm: h,
      weightKg: w,
      bloodGroup: v.bloodGroup || '',
      allergies: this.toList(v.allergies),
      medications: this.toList(v.medications),
      medicalConditions: this.toList(v.medicalConditions),
    };

    this.saving.set(true);
    this.profile
      .updateProfile(payload)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (updated) => {
          this.user.set(updated);
          this.patchForm(updated);
          this.toast.success('Profile updated', 'Your changes have been saved.');
        },
        error: () => this.toast.error('Update failed', 'Could not save your profile.'),
      });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) return;
    const current = this.passwordForm.get('currentPassword')?.value;
    const next = this.passwordForm.get('newPassword')?.value;
    if (!current || !next) return;

    this.changingPassword.set(true);
    this.profile
      .changePassword({
        currentPassword: current,
        newPassword: next,
      })
      .pipe(finalize(() => this.changingPassword.set(false)))
      .subscribe({
        next: () => {
          this.snackbar.open('Password changed successfully', 'Close', { duration: 3000 });
          this.passwordForm.reset();
        },
        error: () => this.toast.error('Password change failed', 'Check your current password.'),
      });
  }
}
