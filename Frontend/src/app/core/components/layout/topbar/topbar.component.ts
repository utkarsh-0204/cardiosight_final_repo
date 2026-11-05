// =============================================================================
// Top toolbar – glassy navigation bar with search, theme, notifications, profile.
// =============================================================================
import { Component, inject, OnInit, DestroyRef } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { AuthService } from '../../../services/auth.service';
import { ThemeService } from '../../../services/theme.service';
import { UiService } from '../../../services/ui.service';
import { ToastService } from '../../../services/toast.service';
import { NotificationService } from '../../../services/notification.service';
import { AvatarComponent } from '../../../../shared/components/avatar/avatar.component';
import { TimeAgoPipe } from '../../../../shared/pipes/time-ago.pipe';
import { SearchOverlayComponent } from '../search-overlay/search-overlay.component';

@Component({
  selector: 'app-topbar',
  template: `
    <header class="topbar">
      <div class="topbar-left">
        <button class="icon-btn mobile-only" (click)="ui.toggleMobileSidebar()" aria-label="Menu">
          <mat-icon>menu</mat-icon>
        </button>
        <button class="icon-btn desktop-only" (click)="ui.toggleSidebar()" aria-label="Toggle sidebar">
          <mat-icon>{{ ui.sidebarCollapsed() ? 'menu_open' : 'menu' }}</mat-icon>
        </button>
        <button class="search-trigger" (click)="ui.openSearch()">
          <mat-icon>search</mat-icon>
          <span>Search patients, predictions…</span>
          <kbd>/</kbd>
        </button>
      </div>

      <div class="topbar-right">
        <button class="icon-btn" (click)="ui.openSearch()" aria-label="Search">
          <mat-icon>search</mat-icon>
        </button>

        <button class="icon-btn" (click)="toggleTheme()" [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
          <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
        </button>

        <button
          class="icon-btn has-badge"
          [matMenuTriggerFor]="notifMenu"
          (menuOpened)="onNotifOpened()"
          aria-label="Notifications"
          [matBadge]="notifications.unreadCount()"
          matBadgeSize="small"
          matBadgeColor="warn"
        >
          <mat-icon>notifications_none</mat-icon>
        </button>

        <div class="divider"></div>

        <button class="profile-trigger" [matMenuTriggerFor]="profileMenu">
          <app-avatar [name]="auth.fullName()" [color]="user()?.avatarColor" [size]="38"></app-avatar>
          <span class="profile-meta">
            <strong>{{ auth.fullName() }}</strong>
            <em>{{ user()?.role === 'admin' ? 'Administrator' : 'Patient' }}</em>
          </span>
          <mat-icon class="caret">arrow_drop_down</mat-icon>
        </button>
      </div>
    </header>

    <mat-menu #notifMenu="matMenu" xPosition="before" [overlapTrigger]="false">
      <div class="notif-panel">
        <div class="notif-head">
          <strong>Notifications</strong>
          <button class="link-btn" (click)="markAllRead()">Mark all read</button>
        </div>
        <div class="notif-list">
          @for (n of notifications.notifications(); track n.id) {
            <button class="notif-item" [class.unread]="!n.read" (click)="notifications.markAsRead(n.id)">
              <span class="notif-icon" [style.--n-tone]="n.type === 'success' ? 'var(--success)' : n.type === 'warning' ? 'var(--warning)' : n.type === 'danger' ? 'var(--danger)' : 'var(--info)'">
                <mat-icon>{{ n.icon }}</mat-icon>
              </span>
              <span class="notif-body">
                <strong>{{ n.title }}</strong>
                <span>{{ n.message }}</span>
                <em>{{ n.createdAt | timeAgo }}</em>
              </span>
            </button>
          } @empty {
            <div class="notif-empty">
              <mat-icon>notifications_off</mat-icon>
              <p>You're all caught up!</p>
            </div>
          }
        </div>
        <a class="notif-footer" routerLink="/app/dashboard">View all activity</a>
      </div>
    </mat-menu>

    <mat-menu #profileMenu="matMenu" xPosition="before" [overlapTrigger]="false">
      <div class="profile-panel">
        <div class="profile-summary">
          <app-avatar [name]="auth.fullName()" [color]="user()?.avatarColor" [size]="46"></app-avatar>
          <div>
            <strong>{{ auth.fullName() }}</strong>
            <span>{{ user()?.email }}</span>
          </div>
        </div>
        <button mat-menu-item routerLink="/app/profile">
          <mat-icon>manage_accounts</mat-icon> My profile
        </button>
        <button mat-menu-item routerLink="/app/history">
          <mat-icon>history</mat-icon> Prediction history
        </button>
        <button mat-menu-item (click)="toggleTheme()">
          <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
          {{ theme.isDark() ? 'Light mode' : 'Dark mode' }}
        </button>
        <div class="profile-divider"></div>
        <button mat-menu-item class="logout" (click)="onLogout()">
          <mat-icon>logout</mat-icon> Sign out
        </button>
      </div>
    </mat-menu>

    <app-search-overlay />
  `,
  styles: [
    `
      :host {
        display: block;
        position: sticky;
        top: 0;
        z-index: 60;
      }
      .topbar {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 14px;
        height: var(--topbar-height);
        padding: 0 22px;
        background: var(--surface);
        border-bottom: 1px solid var(--border);
      }
      .topbar-left,
      .topbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .icon-btn {
        position: relative;
        width: 40px;
        height: 40px;
        border-radius: var(--radius-full);
        border: 1px solid transparent;
        background: transparent;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--ease);
      }
      .icon-btn:hover {
        background: var(--surface-muted);
        color: var(--primary);
        border-color: var(--border);
        transform: translateY(-1px);
      }
      .icon-btn:active {
        transform: scale(0.94);
      }
      .icon-btn mat-icon {
        font-size: 22px;
        height: 22px;
        width: 22px;
      }
      .search-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: 8px;
        padding: 9px 14px;
        width: 320px;
        max-width: 40vw;
        border-radius: var(--radius-full);
        border: 1px solid var(--border);
        background: var(--surface-muted);
        color: var(--text-tertiary);
        font-size: 13px;
        font-family: inherit;
        transition: all var(--ease);
      }
      .search-trigger:hover {
        border-color: var(--primary);
        color: var(--text-secondary);
        background: var(--surface);
        box-shadow: var(--shadow-md);
      }
      .search-trigger mat-icon {
        font-size: 20px;
        height: 20px;
        width: 20px;
        color: var(--text-tertiary);
      }
      .search-trigger kbd {
        margin-left: auto;
        font-size: 11px;
        font-family: var(--font-mono);
        padding: 1px 7px;
        border-radius: 6px;
        border: 1px solid var(--border-strong);
        background: var(--surface);
        color: var(--text-tertiary);
      }
      .divider {
        width: 1px;
        height: 28px;
        background: var(--border);
        margin: 0 6px;
      }
      .profile-trigger {
        display: flex;
        align-items: center;
        gap: 10px;
        border: 1px solid transparent;
        background: transparent;
        padding: 4px 8px 4px 4px;
        border-radius: var(--radius-full);
        transition: all var(--ease);
      }
      .profile-trigger:hover {
        background: var(--surface-muted);
        border-color: var(--border);
        box-shadow: var(--shadow-sm);
      }
      .profile-meta {
        display: flex;
        flex-direction: column;
        text-align: left;
        line-height: 1.2;
      }
      .profile-meta strong {
        font-size: 13px;
        color: var(--text-primary);
        font-weight: 600;
      }
      .profile-meta em {
        font-style: normal;
        font-size: 11.5px;
        color: var(--text-tertiary);
      }
      .caret {
        font-size: 20px;
        height: 20px;
        width: 20px;
        color: var(--text-tertiary);
        transition: transform var(--ease);
      }
      .profile-trigger[aria-expanded='true'] .caret {
        transform: rotate(180deg);
      }
      .mobile-only {
        display: none;
      }
      @media (max-width: 900px) {
        .mobile-only {
          display: flex;
        }
        .desktop-only {
          display: none;
        }
        .search-trigger {
          display: none;
        }
        .profile-meta,
        .caret {
          display: none;
        }
      }

      /* Notification panel */
      .notif-panel,
      .profile-panel {
        min-width: 340px;
        padding: 8px;
      }
      .notif-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 10px;
        border-bottom: 1px solid var(--border);
      }
      .notif-head strong {
        font-size: 14px;
        font-family: var(--font-display);
      }
      .link-btn {
        border: none;
        background: transparent;
        color: var(--secondary);
        font-size: 12px;
        font-weight: 600;
        font-family: inherit;
      }
      .link-btn:hover {
        text-decoration: underline;
      }
      .notif-list {
        max-height: 360px;
        overflow-y: auto;
        padding: 6px 0;
      }
      .notif-item {
        display: flex;
        gap: 12px;
        width: 100%;
        text-align: left;
        padding: 12px;
        border: none;
        background: transparent;
        border-radius: 12px;
        font-family: inherit;
        transition: background var(--transition);
      }
      .notif-item:hover {
        background: var(--surface-muted);
      }
      .notif-item.unread {
        background: color-mix(in srgb, var(--secondary) 6%, transparent);
      }
      .notif-icon {
        width: 38px;
        height: 38px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: color-mix(in srgb, var(--n-tone) 14%, transparent);
        color: var(--n-tone);
        flex-shrink: 0;
      }
      .notif-icon mat-icon {
        font-size: 20px;
        height: 20px;
        width: 20px;
      }
      .notif-body {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .notif-body strong {
        font-size: 13px;
        color: var(--text-primary);
      }
      .notif-body span {
        font-size: 12px;
        color: var(--text-secondary);
      }
      .notif-body em {
        font-style: normal;
        font-size: 11px;
        color: var(--text-tertiary);
      }
      .notif-empty {
        text-align: center;
        padding: 28px 12px;
        color: var(--text-tertiary);
      }
      .notif-empty mat-icon {
        font-size: 34px;
        height: 34px;
        width: 34px;
      }
      .notif-footer {
        display: block;
        text-align: center;
        padding: 10px;
        border-top: 1px solid var(--border);
        font-size: 12.5px;
        font-weight: 600;
        color: var(--secondary);
      }

      /* Profile panel */
      .profile-summary {
        display: flex;
        gap: 12px;
        align-items: center;
        padding: 10px 12px 14px;
        border-bottom: 1px solid var(--border);
        margin-bottom: 6px;
      }
      .profile-summary strong {
        display: block;
        font-size: 14px;
        font-family: var(--font-display);
      }
      .profile-summary span {
        font-size: 12px;
        color: var(--text-tertiary);
      }
      .profile-divider {
        height: 1px;
        background: var(--border);
        margin: 6px 4px;
      }
      .logout {
        color: var(--danger);
      }
    `,
  ],
  standalone: true,
  imports: [
    MatIconModule,
    MatMenuModule,
    MatBadgeModule,
    RouterLink,
    AvatarComponent,
    TimeAgoPipe,
    SearchOverlayComponent,
  ],
})
export class TopbarComponent {
  private readonly destroyRef = inject(DestroyRef);

  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly ui = inject(UiService);
  readonly toast = inject(ToastService);
  readonly notifications = inject(NotificationService);
  readonly router = inject(Router);

  readonly user = this.auth.currentUser;

  constructor() {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && (event.target as HTMLElement | null)?.tagName !== 'INPUT') {
        event.preventDefault();
        this.ui.openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    this.destroyRef.onDestroy(() => window.removeEventListener('keydown', onKey));
  }

  toggleTheme(): void {
    this.theme.toggle();
  }

  onNotifOpened(): void {
    this.notifications.seed();
  }

  markAllRead(): void {
    this.notifications.markAllAsRead();
  }

  onLogout(): void {
    this.auth.logout();
    this.ui.closeMobileSidebar();
    this.toast.info('Signed out', 'You have been logged out of CardioSight.');
    this.router.navigate(['/landing']);
  }
}
