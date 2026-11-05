// =============================================================================
// Admin dashboard – platform KPIs, risk distribution, trends & activity feed.
// =============================================================================
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe, DecimalPipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { ChartWidgetComponent } from '../../shared/components/chart-widget/chart-widget.component';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import type { AdminActivity, AdminStats } from '../../core/models/analytics.model';

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrl: './admin-dashboard.component.scss',
  standalone: true,
  imports: [
    RouterLink,
    DatePipe,
    DecimalPipe,
    MatIconModule,
    MatButtonModule,
    StatCardComponent,
    ChartWidgetComponent,
  ],
})
export class AdminDashboardComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly stats = signal<AdminStats | null>(null);
  readonly activities = signal<AdminActivity[]>([]);

  readonly riskDistribution = computed(() => {
    const s = this.stats();
    if (!s) return { labels: [], values: [], colors: [] };
    if (s.riskDistribution && s.riskDistribution.length > 0) {
      return {
        labels: s.riskDistribution.map((d) => d.label),
        values: s.riskDistribution.map((d) => d.value),
        colors: s.riskDistribution.map((d) => d.color),
      };
    }
    const high = s.highRiskPredictions;
    const low = Math.max(0, s.totalPredictions - high - Math.round(s.avgRiskScore * 0.2));
    const medium = Math.max(0, s.totalPredictions - high - low);
    return {
      labels: ['Low risk', 'Medium risk', 'High risk'],
      values: [low, medium, high],
      colors: ['#43A047', '#F9A825', '#E53935'],
    };
  });

  readonly monthly = computed(() => {
    const s = this.stats();
    const pts = s?.monthlyPredictions ?? [];
    return {
      labels: pts.map((p) => p.month),
      predictions: pts.map((p) => p.predictions),
      highRisk: pts.map((p) => p.highRisk),
    };
  });

  readonly genderDistribution = computed(() => {
    const s = this.stats();
    const g = s?.genderDistribution ?? [];
    return {
      labels: g.map((item) => item.label),
      values: g.map((item) => item.value),
    };
  });

  ngOnInit(): void {
    this.admin.getStats().subscribe({
      next: (s) => {
        this.stats.set(s);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Could not load stats', 'Please try again.');
      },
    });
    this.admin.getActivities().subscribe({
      next: (acts) => this.activities.set(acts),
    });
  }
}
