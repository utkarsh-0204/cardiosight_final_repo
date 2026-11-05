// =============================================================================
// Admin Prediction Monitoring Component
// Read-only oversight of clinical risk assessments across the platform.
// =============================================================================
import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, DecimalPipe, UpperCasePipe } from '@angular/common';
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
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import type { AdminPredictionRow } from '../../core/models/analytics.model';

@Component({
  selector: 'app-admin-predictions',
  templateUrl: './admin-predictions.component.html',
  styleUrl: './admin-predictions.component.scss',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    UpperCasePipe,
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressBarModule,
    MatTooltipModule,
    EmptyStateComponent,
  ],
})
export class AdminPredictionsComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly search = new FormControl('');
  readonly riskFilter = new FormControl('all');
  readonly loading = signal(true);
  readonly predictions = signal<AdminPredictionRow[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly totalPages = signal(1);

  ngOnInit(): void {
    this.search.valueChanges.subscribe(() => {
      this.page.set(1);
      this.load();
    });
    this.riskFilter.valueChanges.subscribe(() => {
      this.page.set(1);
      this.load();
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.admin.getPredictions({
      search: this.search.value ?? '',
      riskLevel: this.riskFilter.value ?? 'all',
      page: this.page(),
      limit: 12,
    }).subscribe({
      next: (res) => {
        this.predictions.set(res.predictions);
        this.total.set(res.total);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Failed to load predictions', 'Please try again.');
      },
    });
  }

  prevPage(): void {
    if (this.page() > 1) {
      this.page.update((p) => p - 1);
      this.load();
    }
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) {
      this.page.update((p) => p + 1);
      this.load();
    }
  }

  riskClass(risk: string): string {
    return (risk || 'low').toLowerCase();
  }
}
