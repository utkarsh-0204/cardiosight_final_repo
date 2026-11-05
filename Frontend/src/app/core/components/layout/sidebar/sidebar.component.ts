// =============================================================================
// Sidebar navigation – premium dark glass with animated active states.
// =============================================================================
import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../services/auth.service';
import { UiService } from '../../../services/ui.service';
import { ToastService } from '../../../services/toast.service';

interface NavItem {
  label: string;
  icon: string;
  route: string;
  exact?: boolean;
}

const PATIENT_NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: '/app/dashboard', exact: true },
  { label: 'New Prediction', icon: 'monitor_heart', route: '/app/predict' },
  { label: 'My History', icon: 'history', route: '/app/history' },
  { label: 'My Profile', icon: 'manage_accounts', route: '/app/profile' },
  { label: 'About Project', icon: 'info', route: '/app/about' },
];

const ADMIN_NAV_ITEMS: NavItem[] = [
  { label: 'Admin Dashboard', icon: 'admin_panel_settings', route: '/app/admin', exact: true },
  { label: 'User Management', icon: 'group', route: '/app/admin/users' },
  { label: 'Prediction Monitoring', icon: 'insights', route: '/app/admin/predictions' },
  { label: 'Analytics', icon: 'query_stats', route: '/app/analytics' },
  { label: 'System Health', icon: 'health_and_safety', route: '/app/admin/health' },
  { label: 'About Project', icon: 'info', route: '/app/about' },
  { label: 'Admin Profile', icon: 'manage_accounts', route: '/app/profile' },
];

@Component({
  selector: 'app-sidebar',
  template: `
    <div class="sidebar" [class.collapsed]="collapsed()">
      <a class="brand" routerLink="/landing">
        <span class="brand-mark">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M3 17h5l2.5-6 4 10 3-7 2 3h5.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="27" cy="6" r="2.8" fill="#F06464"/>
          </svg>
        </span>
        <span class="brand-name">Cardio<em>Sight</em></span>
      </a>

      <nav class="nav">
        @if (isAdmin()) {
          <p class="nav-section" [class.hidden]="collapsed()">Administration</p>
          @for (item of adminNavItems; track item.route) {
            <a
              class="nav-link"
              [routerLink]="item.route"
              [class.active]="isActive(item.route, item.exact)"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: !!item.exact }"
            >
              <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        } @else {
          <p class="nav-section" [class.hidden]="collapsed()">Patient Portal</p>
          @for (item of patientNavItems; track item.route) {
            <a
              class="nav-link"
              [routerLink]="item.route"
              [class.active]="isActive(item.route, item.exact)"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: !!item.exact }"
            >
              <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
              <span class="nav-label">{{ item.label }}</span>
            </a>
          }
        }

        <p class="nav-section" [class.hidden]="collapsed()">Support</p>
        <a class="nav-link" routerLink="/landing" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: false }">
          <mat-icon class="nav-icon">public</mat-icon>
          <span class="nav-label">Website</span>
        </a>
      </nav>

      <div class="sidebar-footer">
        <div class="cardio-note" [class.hidden]="collapsed()">
          <span class="cn-icon"><mat-icon>favorite</mat-icon></span>
          <div class="cn-body">
            <strong>Know your heart</strong>
            <span>Predict early, act today.</span>
          </div>
        </div>
        <button class="logout-link" (click)="onLogout()">
          <mat-icon class="nav-icon">logout</mat-icon>
          <span class="nav-label">Sign out</span>
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      .sidebar {
        position: relative;
        height: 100%;
        display: flex;
        flex-direction: column;
        background: #0B1020;
        border-right: 1px solid rgba(255, 255, 255, 0.07);
        color: var(--sidebar-text);
        padding: 18px 14px;
        transition: width var(--ease);
        width: var(--sidebar-width);
        overflow: hidden;
      }
      .sidebar.collapsed {
        width: var(--sidebar-width-collapsed);
      }
      .brand {
        position: relative;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 8px 20px;
        color: #fff;
        min-height: 54px;
        text-decoration: none;
      }
      .brand-mark {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: #161F33;
        border: 1px solid rgba(255, 255, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .brand-mark svg {
        width: 20px;
        height: 20px;
      }
      .brand-name {
        font-family: var(--font-sans);
        font-size: 16px;
        font-weight: 600;
        letter-spacing: -0.01em;
        color: #F8FAFC;
        white-space: nowrap;
      }
      .brand-name em {
        font-style: normal;
        color: #F06464;
      }
      .nav {
        position: relative;
        z-index: 1;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        overflow-y: auto;
        overflow-x: hidden;
      }
      .nav-section {
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: rgba(170, 180, 196, 0.45);
        margin: 18px 12px 8px;
        white-space: nowrap;
        transition: opacity var(--transition), margin var(--transition), height var(--transition);
      }
      .nav-section.hidden {
        opacity: 0;
        margin: 0;
        height: 0;
      }
      .nav-link {
        position: relative;
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 11px 14px;
        border-radius: 14px;
        color: var(--sidebar-text);
        font-size: 13.8px;
        font-weight: 500;
        white-space: nowrap;
        transition: color var(--transition), background var(--transition), transform var(--transition);
        overflow: hidden;
      }
      .nav-link::before {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: linear-gradient(120deg, #e53935 0%, #8e2f2c 100%);
        box-shadow: 0 8px 22px -6px rgba(229, 57, 53, 0.55);
        transform: scale(0.9);
        opacity: 0;
        transition: transform var(--ease-spring), opacity var(--ease);
        z-index: -1;
      }
      .nav-link .nav-icon {
        font-size: 22px;
        height: 22px;
        width: 22px;
        flex-shrink: 0;
        transition: transform var(--ease-spring), color var(--transition);
      }
      .nav-link:hover {
        background: rgba(255, 255, 255, 0.055);
        color: #fff;
      }
      .nav-link:hover .nav-icon {
        transform: scale(1.12) translateY(-1px);
      }
      .nav-link.active {
        color: #fff;
      }
      .nav-link.active::before {
        transform: scale(1);
        opacity: 1;
      }
      .nav-link.active .nav-icon {
        color: #fff;
        filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.25));
      }
      .sidebar-footer {
        position: relative;
        z-index: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.07);
      }
      .cardio-note {
        display: flex;
        gap: 11px;
        align-items: center;
        padding: 12px 13px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(67, 160, 71, 0.2), rgba(21, 101, 192, 0.14));
        border: 1px solid rgba(102, 187, 106, 0.28);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        white-space: nowrap;
      }
      .cn-icon {
        width: 34px;
        height: 34px;
        border-radius: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background: rgba(102, 187, 106, 0.2);
        color: #66bb6a;
      }
      .cn-icon mat-icon {
        font-size: 18px;
        height: 18px;
        width: 18px;
        animation: heartbeat 2.4s ease-in-out infinite;
      }
      .cn-body strong {
        display: block;
        font-size: 12.5px;
        color: #eaffea;
      }
      .cn-body span {
        font-size: 11px;
        color: #a3c9a5;
      }
      .cardio-note.hidden {
        display: none;
      }
      .logout-link {
        display: flex;
        align-items: center;
        gap: 13px;
        padding: 11px 14px;
        border: none;
        background: transparent;
        color: var(--sidebar-text);
        border-radius: 14px;
        font-size: 13.8px;
        font-weight: 500;
        font-family: inherit;
        white-space: nowrap;
        transition: all var(--transition);
      }
      .logout-link:hover {
        background: rgba(229, 57, 53, 0.16);
        color: #ff8a80;
      }
      .logout-link .nav-icon {
        font-size: 22px;
        height: 22px;
        width: 22px;
      }
      .sidebar.collapsed .brand {
        justify-content: center;
        padding-inline: 0;
      }
      .sidebar.collapsed .brand-name,
      .sidebar.collapsed .nav-label,
      .sidebar.collapsed .cn-body {
        opacity: 0;
        width: 0;
        overflow: hidden;
      }
      .sidebar.collapsed .nav-link,
      .sidebar.collapsed .logout-link {
        justify-content: center;
        padding-inline: 0;
      }
      .sidebar.collapsed .cardio-note {
        justify-content: center;
        padding: 10px;
      }
    `,
  ],
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatIconModule],
})
export class SidebarComponent {
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly collapsed = this.ui.sidebarCollapsed;
  readonly isAdmin = this.auth.isAdmin;
  readonly patientNavItems = PATIENT_NAV_ITEMS;
  readonly adminNavItems = ADMIN_NAV_ITEMS;

  isActive(route: string, exact?: boolean): boolean {
    const url = this.router.url.split('?')[0];
    return exact ? url === route : url.startsWith(route);
  }

  onLogout(): void {
    this.auth.logout();
    this.ui.closeMobileSidebar();
    this.toast.info('Signed out', 'You have been logged out of CardioSight.');
    this.router.navigate(['/landing']);
  }
}
