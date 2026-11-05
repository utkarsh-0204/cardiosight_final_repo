// =============================================================================
// Admin User Management Component
// Production-grade user inspection, status control, and prediction audit.
// =============================================================================
import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe, TitleCasePipe } from '@angular/common';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import type { AdminUserRow, AdminUserDetails } from '../../core/models/analytics.model';

@Component({
  selector: 'app-admin-users',
  templateUrl: './admin-users.component.html',
  styleUrl: './admin-users.component.scss',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    UpperCasePipe,
    TitleCasePipe,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatTooltipModule,
    AvatarComponent,
    EmptyStateComponent,
  ],
})
export class AdminUsersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly search = new FormControl('');
  readonly typeFilter = new FormControl<'genuine' | 'test' | 'all'>('genuine');
  readonly roleFilter = new FormControl<'all' | 'patient' | 'admin'>('all');
  readonly statusFilter = new FormControl<'all' | 'active' | 'inactive' | 'suspended'>('all');
  readonly sortBy = new FormControl<'createdAt' | 'lastActiveAt' | 'predictionsCount'>('createdAt');

  readonly loading = signal(true);
  readonly users = signal<AdminUserRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly totalPages = signal(1);

  // Inspection Drawer / Modal State
  readonly inspectingUser = signal<AdminUserDetails | null>(null);
  readonly userPredictions = signal<Array<{
    id: string;
    riskLevel: string;
    riskScore: number;
    probability: number;
    confidence: number;
    hasEcg: boolean;
    hasTmt: boolean;
    submittedAt: string;
  }>>([]);
  readonly loadingDetails = signal(false);

  ngOnInit(): void {
    this.search.valueChanges.subscribe(() => {
      this.page.set(1);
      this.reload();
    });
    this.typeFilter.valueChanges.subscribe(() => {
      this.page.set(1);
      this.reload();
    });
    this.roleFilter.valueChanges.subscribe(() => {
      this.page.set(1);
      this.reload();
    });
    this.statusFilter.valueChanges.subscribe(() => {
      this.page.set(1);
      this.reload();
    });
    this.sortBy.valueChanges.subscribe(() => {
      this.page.set(1);
      this.reload();
    });

    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.admin.getUsers({
      search: this.search.value ?? '',
      type: this.typeFilter.value ?? 'genuine',
      role: this.roleFilter.value ?? 'all',
      status: this.statusFilter.value ?? 'all',
      sortBy: this.sortBy.value ?? 'createdAt',
      order: 'desc',
      page: this.page(),
      limit: 12,
      paginate: false,
    }).subscribe({
      next: (res) => {
        const list = Array.isArray(res) ? res : ((res as unknown as { users: AdminUserRow[] }).users || []);
        this.users.set(list);
        this.total.set(list.length);
        this.totalPages.set(Math.max(1, Math.ceil(list.length / 12)));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load users', 'Please try again.');
      },
    });
  }

  viewDetails(user: AdminUserRow): void {
    this.loadingDetails.set(true);
    this.inspectingUser.set(null);
    this.userPredictions.set([]);

    this.admin.getUserDetails(user.id).subscribe({
      next: (details) => {
        this.inspectingUser.set(details);
        this.admin.getUserPredictions(user.id).subscribe({
          next: (predRes) => {
            this.userPredictions.set(predRes.predictions);
            this.loadingDetails.set(false);
          },
          error: () => this.loadingDetails.set(false),
        });
      },
      error: () => {
        this.loadingDetails.set(false);
        this.toast.error('Failed to load user details', 'Could not retrieve patient profile.');
      },
    });
  }

  closeDrawer(): void {
    this.inspectingUser.set(null);
    this.userPredictions.set([]);
  }

  toggleStatus(user: AdminUserRow): void {
    const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
    const actionLabel = newStatus === 'suspended' ? 'Suspend' : 'Reactivate';

    if (confirm(`Are you sure you want to ${actionLabel.toLowerCase()} account ${user.email}?`)) {
      this.admin.updateUserStatus(user.id, newStatus).subscribe({
        next: () => {
          this.toast.success(
            `Account ${actionLabel}ed`,
            `${user.firstName} ${user.lastName} is now ${newStatus}.`
          );
          this.reload();
          if (this.inspectingUser()?.id === user.id) {
            this.viewDetails(user);
          }
        },
        error: (err) => {
          this.toast.error('Status update failed', err?.error?.message || 'Could not update status.');
        },
      });
    }
  }

  delete(user: AdminUserRow): void {
    if (user.role === 'admin') {
      this.toast.error('Action blocked', 'Administrator accounts cannot be deleted.');
      return;
    }

    if (confirm(`CAUTION: Permanently delete ${user.firstName} ${user.lastName} (${user.email}) and all associated records?`)) {
      this.admin.deleteUser(user.id).subscribe({
        next: () => {
          this.toast.success('User removed', `${user.firstName} ${user.lastName} was deleted from database.`);
          if (this.inspectingUser()?.id === user.id) {
            this.closeDrawer();
          }
          this.reload();
        },
        error: (err) => {
          this.toast.error('Delete failed', err?.error?.message || 'Could not delete user.');
        },
      });
    }
  }

  statusClass(status: string): string {
    return (status || 'active').toLowerCase();
  }

  accountTypeLabel(user: AdminUserRow): string {
    if (user.isTest) return 'Test / QA';
    if (user.role === 'admin') return 'System Admin';
    return 'Genuine Patient';
  }

  accountTypeClass(user: AdminUserRow): string {
    if (user.isTest) return 'test';
    if (user.role === 'admin') return 'admin';
    return 'genuine';
  }
}
