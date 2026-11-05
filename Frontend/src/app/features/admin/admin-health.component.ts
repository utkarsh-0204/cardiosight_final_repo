// =============================================================================
// Admin System Health & Audit Logs Component
// Real-time infrastructure diagnostics and administrative activity trail.
// =============================================================================
import { Component, inject, OnInit, signal } from '@angular/core';
import { DatePipe, UpperCasePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminService } from '../../core/services/admin.service';
import { ToastService } from '../../core/services/toast.service';
import type { SystemHealthReport, AdminAuditLog } from '../../core/models/analytics.model';

@Component({
  selector: 'app-admin-health',
  templateUrl: './admin-health.component.html',
  styleUrl: './admin-health.component.scss',
  standalone: true,
  imports: [
    DatePipe,
    UpperCasePipe,
    MatIconModule,
    MatButtonModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
})
export class AdminHealthComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly loading = signal(true);
  readonly health = signal<SystemHealthReport | null>(null);
  readonly auditLogs = signal<AdminAuditLog[]>([]);

  ngOnInit(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.admin.getSystemHealth().subscribe({
      next: (h) => {
        this.health.set(h);
        this.admin.getAuditLogs(1, 10).subscribe({
          next: (logsRes) => {
            this.auditLogs.set(logsRes.logs);
            this.loading.set(false);
          },
          error: () => this.loading.set(false),
        });
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('System health check failed', 'One or more services may be down.');
      },
    });
  }

  formatUptime(sec = 0): string {
    const hours = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    return `${hours}h ${mins}m`;
  }
}
