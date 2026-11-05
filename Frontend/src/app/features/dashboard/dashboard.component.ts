// =============================================================================
// Patient & Clinical Intelligence Dashboard – Premium Healthcare Platform
// Features Framingham risk model, ECG telemetry, TMT analysis, vital indicators,
// analytics trends, and real-time clinical activity surveillance.
// =============================================================================
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgClass, DatePipe, UpperCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { NotificationService } from '../../core/services/notification.service';
import { ToastService } from '../../core/services/toast.service';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import {
  ChartDataset,
  ChartWidgetOptions,
} from '../../shared/components/chart-widget/chart-widget.component';
import { RiskClassPipe, RiskLabelPipe } from '../../shared/pipes/risk.pipe';
import type { DashboardSummary, AppNotification, ActivityEvent, HealthTip } from '../../core/models/health.model';
import type { PredictionRecord, EcgFindings, TmtFindings } from '../../core/models/prediction.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
  standalone: true,
  imports: [
    RouterLink,
    MatIconModule,
    MatButtonModule,
    SkeletonComponent,
    NgClass,
    DatePipe,
    UpperCasePipe,
    RiskClassPipe,
    RiskLabelPipe,
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

  readonly patientIdCode = computed(() => {
    const u = this.user();
    return u && u.id ? u.id.slice(0, 8).toUpperCase() : '8401';
  });

  readonly patientGender = computed(() => {
    const p = this.latestPrediction();
    if (p) return p.male === 1 ? 'MALE' : 'FEMALE';
    const u = this.user();
    return u && u.gender ? u.gender.toUpperCase() : 'MALE';
  });

  hasRecordEcg(rec: PredictionRecord): boolean {
    return Boolean((rec.input as { ecg?: unknown })?.ecg);
  }

  hasRecordTmt(rec: PredictionRecord): boolean {
    return Boolean((rec.input as { tmt?: unknown })?.tmt);
  }

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  });

  // Latest clinical prediction record from historical data
  readonly latestPrediction = computed<PredictionRecord | null>(() => {
    const records = this.summary()?.recentPredictions;
    return records && records.length > 0 ? records[0] : null;
  });

  readonly recentPredictions = computed<PredictionRecord[]>(() => {
    return (this.summary()?.recentPredictions ?? []).slice(0, 5);
  });

  readonly riskExplanation = computed(() => {
    const level = this.summary()?.riskLevel;
    const score = this.summary()?.riskScore ?? 0;
    if (level === 'high') {
      return `Estimated 10-year coronary heart disease probability is ${score}%, placing the patient in the high-risk cohort under Framingham guidelines. Targeted therapeutic intervention, lipid management, and clinical cardiology consultation are indicated.`;
    }
    if (level === 'medium') {
      return `Estimated 10-year coronary heart disease probability is ${score}%, representing borderline-to-moderate cardiovascular risk. Proactive lifestyle modifications, glycemic control, and routine follow-up are recommended.`;
    }
    return `Estimated 10-year coronary heart disease probability is ${score}%, placing the patient in the low-risk category. Continued preventive wellness, balanced sleep hygiene, and routine monitoring are advised.`;
  });

  readonly latestInput = computed(() => this.latestPrediction()?.input ?? null);

  readonly latestEcg = computed<EcgFindings | null>(() => {
    const inp = this.latestInput() as { ecg?: EcgFindings | null } | null;
    return inp?.ecg ?? null;
  });

  readonly latestTmt = computed<TmtFindings | null>(() => {
    const inp = this.latestInput() as { tmt?: TmtFindings | null } | null;
    return inp?.tmt ?? null;
  });

  readonly hasEcg = computed(() => {
    const ecg = this.latestEcg();
    return Boolean(ecg && ecg.status && ecg.status !== 'error');
  });

  readonly hasTmt = computed(() => {
    const tmt = this.latestTmt();
    return Boolean(tmt && tmt.status && tmt.status !== 'error');
  });

  readonly riskColor = computed(() => {
    const level = this.summary()?.riskLevel;
    if (level === 'high') return '#ef4444';
    if (level === 'medium') return '#f59e0b';
    return '#10b981';
  });

  readonly healthScoreColor = computed(() => {
    const score = this.summary()?.healthScore ?? 0;
    if (score >= 75) return '#10b981';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  });

  // Synthesized Framingham clinical indicators with guideline-based status
  readonly clinicalIndicators = computed(() => {
    const inp = this.latestInput();
    if (!inp) {
      return [
        { label: 'Blood Pressure', value: '120/80', unit: 'mmHg', status: 'good', tag: 'Optimal', icon: 'speed' },
        { label: 'Resting Heart Rate', value: '72', unit: 'bpm', status: 'good', tag: 'Normal Sinus', icon: 'favorite' },
        { label: 'Total Cholesterol', value: '195', unit: 'mg/dL', status: 'good', tag: 'Desirable', icon: 'water_drop' },
        { label: 'Fasting Glucose', value: '92', unit: 'mg/dL', status: 'good', tag: 'Normoglycemic', icon: 'biotech' },
        { label: 'Body Mass Index', value: '24.2', unit: 'kg/m²', status: 'good', tag: 'Normal Weight', icon: 'accessibility_new' },
      ];
    }
    const sys = inp.sysBP || 120;
    const dia = inp.diaBP || 80;
    const bpStatus = sys >= 140 || dia >= 90 ? 'danger' : sys >= 130 || dia >= 85 ? 'warning' : 'good';
    const bpTag = sys >= 140 ? 'Stage 2 HTN' : sys >= 130 ? 'Stage 1 HTN' : sys >= 120 ? 'Elevated' : 'Optimal';

    const hr = inp.heartRate || 72;
    const hrStatus = hr > 100 || hr < 50 ? 'danger' : hr > 85 ? 'warning' : 'good';
    const hrTag = hr > 100 ? 'Tachycardia' : hr < 50 ? 'Bradycardia' : 'Normal Sinus';

    const chol = inp.totChol || 190;
    const cholStatus = chol >= 240 ? 'danger' : chol >= 200 ? 'warning' : 'good';
    const cholTag = chol >= 240 ? 'High Risk' : chol >= 200 ? 'Borderline High' : 'Desirable';

    const gluc = inp.glucose || 90;
    const glucStatus = gluc >= 126 ? 'danger' : gluc >= 100 ? 'warning' : 'good';
    const glucTag = gluc >= 126 ? 'Diabetic Range' : gluc >= 100 ? 'Impaired Fasting' : 'Normal';

    const bmi = inp.BMI || 24;
    const bmiStatus = bmi >= 30 ? 'danger' : bmi >= 25 ? 'warning' : 'good';
    const bmiTag = bmi >= 30 ? 'Obese' : bmi >= 25 ? 'Overweight' : 'Normal Weight';

    return [
      { label: 'Blood Pressure', value: `${sys}/${dia}`, unit: 'mmHg', status: bpStatus, tag: bpTag, icon: 'speed' },
      { label: 'Resting Heart Rate', value: `${hr}`, unit: 'bpm', status: hrStatus, tag: hrTag, icon: 'favorite' },
      { label: 'Total Cholesterol', value: `${chol}`, unit: 'mg/dL', status: cholStatus, tag: cholTag, icon: 'water_drop' },
      { label: 'Fasting Glucose', value: `${gluc}`, unit: 'mg/dL', status: glucStatus, tag: glucTag, icon: 'biotech' },
      { label: 'Body Mass Index', value: `${bmi.toFixed(1)}`, unit: 'kg/m²', status: bmiStatus, tag: bmiTag, icon: 'accessibility_new' },
    ];
  });

  // Framingham risk model parameters breakdown
  readonly framinghamSummary = computed(() => {
    const inp = this.latestInput();
    if (!inp) return null;
    return {
      age: inp.age,
      gender: inp.male === 1 ? 'Male' : 'Female',
      smoker: inp.currentSmoker === 1 ? `Active (${inp.cigsPerDay} cigs/day)` : 'Non-smoker',
      bpMeds: inp.BPMeds === 1 ? 'Under Medication' : 'None',
      hypertension: inp.prevalentHyp === 1 ? 'Prevalent Hypertension' : 'Normotensive',
      priorStroke: inp.prevalentStroke === 1 ? 'Reported History' : 'None reported',
      diabetes: inp.diabetes === 1 ? 'Diabetic' : 'Non-diabetic',
    };
  });

  // Trend labels & datasets
  readonly trendLabels = computed(() => {
    const records = this.summary()?.recentPredictions ?? [];
    if (records.length === 0) return ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5'];
    return records
      .slice(0, 7)
      .reverse()
      .map((r) => r.submittedAt.slice(8, 10) + '/' + r.submittedAt.slice(5, 7));
  });

  readonly trendDatasets = computed<ChartDataset[]>(() => {
    const records = this.summary()?.recentPredictions ?? [];
    const scores = records
      .slice(0, 7)
      .reverse()
      .map((r) => r.riskScore);
    const data = scores.length > 0 ? scores : [12, 14, 18, 16, 18];

    return [
      {
        label: '10-Year CHD Risk (%)',
        data,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderWidth: 2.5,
      },
    ];
  });

  readonly riskChartDatasets = computed<ChartDataset[]>(() => {
    const records = this.summary()?.recentPredictions ?? [];
    const low = records.filter((r) => r.riskLevel === 'low').length;
    const medium = records.filter((r) => r.riskLevel === 'medium').length;
    const high = records.filter((r) => r.riskLevel === 'high').length;
    const total = low + medium + high;

    return [
      {
        data: total > 0 ? [low, medium, high] : [1, 0, 0],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        borderWidth: 0,
      },
    ];
  });

  readonly trendChartOptions: ChartWidgetOptions = {
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
        borderWidth: 1,
        padding: 10,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94a3b8' },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8' },
      },
    },
  };

  readonly doughnutOptions: ChartWidgetOptions = {
    cutout: '72%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 14,
          color: '#94a3b8',
          font: { size: 12 },
        },
      },
    },
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
      next: (items) => this.activities.set(items.slice(0, 6)),
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

  exportSummary(): void {
    this.toast.info('Export Summary', 'Preparing printable clinical telemetry overview…');
    setTimeout(() => {
      window.print();
    }, 400);
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
  }
}
