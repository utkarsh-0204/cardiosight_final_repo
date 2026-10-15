// =============================================================================
// Patient dashboard – welcome, health score, recent predictions, charts,
// quick actions, notifications and activity timeline.
// =============================================================================
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgClass, DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { AnimatedCounterComponent } from '../../shared/components/animated-counter/animated-counter.component';
import { CircularProgressComponent } from '../../shared/components/circular-progress/circular-progress.component';
import { HealthTipsCarouselComponent } from '../../shared/components/health-tips-carousel/health-tips-carousel.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { ChartWidgetComponent, ChartDataset, ChartKind, ChartWidgetOptions } from '../../shared/components/chart-widget/chart-widget.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { RiskClassPipe, RiskLabelPipe } from '../../shared/pipes/risk.pipe';
import { TimeAgoPipe } from '../../shared/pipes/time-ago.pipe';
import type { DashboardSummary } from '../../core/models/health.model';
import type { AppNotification } from '../../core/models/health.model';
import type { ActivityEvent } from '../../core/models/health.model';
import type { HealthTip } from '../../core/models/health.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    StatCardComponent,
    AnimatedCounterComponent,
    CircularProgressComponent,
    HealthTipsCarouselComponent,
    SkeletonComponent,
    ChartWidgetComponent,
    EmptyStateComponent,
    NgClass,
    DatePipe,
    RiskClassPipe,
    RiskLabelPipe,
    TimeAgoPipe,
  ],
})
export class DashboardComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly dashboard = inject(DashboardService);
  private readonly notifications = inject(NotificationService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly summary = signal<DashboardSummary | null>(null);
  readonly activities = signal<ActivityEvent[]>([]);
  readonly tips = signal<HealthTip[]>([]);
  readonly recentNotifications = signal<AppNotification[]>([]);

  readonly user = this.auth.currentUser;

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  readonly riskColor = computed(() => {
    const level = this.summary()?.riskLevel;
    if (level === 'high') return '#E53935';
    if (level === 'medium') return '#F9A825';
    return '#43A047';
  });

  readonly healthScoreColor = computed(() => {
    const score = this.summary()?.healthScore ?? 0;
    if (score >= 75) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--danger)';
  });

  readonly trendLabels = computed(() => {
    const records = this.summary()?.recentPredictions ?? [];
    return records.map((r) => r.submittedAt.slice(8, 10) + '/' + r.submittedAt.slice(5, 7));
  });

  readonly trendDatasets = computed<ChartDataset[]>(() => [
    {
      label: 'Risk score',
      data: (this.summary()?.recentPredictions ?? []).map((r) => r.riskScore),
      borderColor: '#E53935',
      backgroundColor: 'rgba(229, 57, 53, 0.12)',
      fill: true,
      tension: 0.45,
      pointRadius: 4,
      pointHoverRadius: 6,
    },
  ]);

  readonly riskChartDatasets = computed<ChartDataset[]>(() => {
    const records = this.summary()?.recentPredictions ?? [];
    const low = records.filter((r) => r.riskLevel === 'low').length;
    const medium = records.filter((r) => r.riskLevel === 'medium').length;
    const high = records.filter((r) => r.riskLevel === 'high').length;
    return [
      {
        data: [low, medium, high],
        backgroundColor: ['#43A047', '#F9A825', '#E53935'],
        borderWidth: 0,
      },
    ];
  });

  readonly trendChartOptions: ChartWidgetOptions = {
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, max: 100, grid: { display: true } },
      x: { grid: { display: false } },
    },
  };

  readonly doughnutOptions: ChartWidgetOptions = {
    cutout: '68%',
    plugins: { legend: { position: 'bottom', labels: { padding: 14 } } },
  };

  ngOnInit(): void {
    this.loadAll();
  }

  private loadAll(): void {
    this.dashboard.getSummary().subscribe({
      next: (summary) => {
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });

    this.notifications.load().subscribe({
      next: (items) => {
        this.notifications.replace(items);
        this.recentNotifications.set(items.slice(0, 4));
      },
      error: () => {},
    });

    this.dashboard.getActivities().subscribe({
      next: (items) => this.activities.set(items.slice(0, 5)),
      error: () => {},
    });

    this.dashboard.getHealthTips().subscribe({
      next: (tips) => this.tips.set(tips),
      error: () => {},
    });
  }

  goPredict(): void {
    this.router.navigate(['/app/predict']);
  }

  viewResult(id: string): void {
    this.router.navigate(['/app/result', id]);
  }

  markNotificationRead(id: string): void {
    this.notifications.markAsRead(id);
  }

  markAllNotificationsRead(): void {
    this.notifications.markAllAsRead();
    this.recentNotifications.set(
      this.recentNotifications().map((n) => ({ ...n, read: true })),
    );
  }

  openAllNotifications(): void {
    this.router.navigate(['/app/dashboard'], { fragment: 'notifications' });
  }

  onQuickAction(action: string): void {
    if (action === 'predict') this.goPredict();
    if (action === 'history') this.router.navigate(['/app/history']);
    if (action === 'analytics') this.router.navigate(['/app/analytics']);
    if (action === 'profile') this.router.navigate(['/app/profile']);
    this.toast.info('Quick action', 'Navigating…');
  }
}
