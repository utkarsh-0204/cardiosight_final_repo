// =============================================================================
// Application shell – sidebar + topbar + breadcrumbs + routed content + FAB.
// =============================================================================
import { Component, inject } from '@angular/core';
import { NgIf } from '@angular/common';
import { Router, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { UiService } from '../../../services/ui.service';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';
import { BreadcrumbsComponent } from '../breadcrumbs/breadcrumbs.component';

@Component({
  selector: 'app-shell',
  template: `
    <div
      class="shell"
      [class.collapsed]="ui.sidebarCollapsed()"
      [class.mobile-open]="ui.mobileSidebarOpen()"
    >
      <aside class="sidebar-area">
        <app-sidebar />
      </aside>

      <div
        class="mobile-backdrop"
        *ngIf="ui.mobileSidebarOpen()"
        (click)="ui.closeMobileSidebar()"
      ></div>

      <div class="main-area">
        <app-topbar />
        <div class="content-area">
          <div class="breadcrumb-row">
            <app-breadcrumbs />
          </div>
          <div class="router-host">
            <router-outlet />
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .shell {
        min-height: 100vh;
        display: flex;
        position: relative;
        background-color: var(--background);
      }
      .sidebar-area {
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: var(--sidebar-width);
        z-index: 90;
        transition: width var(--ease);
      }
      .shell.collapsed .sidebar-area {
        width: var(--sidebar-width-collapsed);
      }
      .main-area {
        flex: 1;
        margin-left: var(--sidebar-width);
        min-width: 0;
        transition: margin-left var(--ease);
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        position: relative;
        z-index: 1;
      }
      .shell.collapsed .main-area {
        margin-left: var(--sidebar-width-collapsed);
      }
      .content-area {
        flex: 1;
        padding: 24px 28px 72px;
        max-width: var(--content-max);
        width: 100%;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .breadcrumb-row {
        margin-bottom: 18px;
      }
      .router-host {
        animation: fade-in 0.35s var(--ease-out) both;
        width: 100%;
        min-width: 0;
      }
      .mobile-backdrop {
        display: none;
      }

      /* Floating action button */
      .fab {
        position: fixed;
        right: 28px;
        bottom: 28px;
        z-index: 70;
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 58px;
        padding: 0 20px 0 14px;
        border: none;
        border-radius: var(--radius-full);
        background: var(--gradient-brand);
        color: #fff;
        font-family: var(--font-sans);
        font-size: 14px;
        font-weight: 600;
        box-shadow: var(--shadow-glow-primary);
        cursor: pointer;
        overflow: visible;
        transition: transform var(--ease-spring), box-shadow var(--ease);
      }
      .fab mat-icon {
        font-size: 26px;
        height: 26px;
        width: 26px;
        transition: transform var(--ease-spring);
      }
      .fab-label {
        white-space: nowrap;
        transition: max-width var(--ease), opacity var(--ease);
        max-width: 140px;
        overflow: hidden;
      }
      .fab:hover {
        transform: translateY(-4px) scale(1.03);
        box-shadow: 0 18px 44px -8px rgba(229, 57, 53, 0.65);
      }
      .fab:hover mat-icon {
        transform: rotate(90deg);
      }
      .fab:active {
        transform: translateY(-1px) scale(0.96);
      }

      @media (max-width: 900px) {
        .sidebar-area {
          transform: translateX(-100%);
          box-shadow: none;
          transition: transform var(--ease);
        }
        .shell.mobile-open .sidebar-area {
          transform: translateX(0);
        }
        .shell.collapsed .main-area,
        .main-area {
          margin-left: 0;
        }
        .mobile-backdrop {
          display: block;
          position: fixed;
          inset: 0;
          z-index: 85;
          background: rgba(10, 15, 25, 0.5);
          backdrop-filter: blur(3px);
        }
        .content-area {
          padding: 16px 14px 84px;
        }
        .fab {
          right: 18px;
          bottom: 18px;
          height: 56px;
          padding: 0 18px 0 16px;
        }
        .fab-label {
          display: none;
        }
      }
    `,
  ],
  standalone: true,
  imports: [NgIf, RouterOutlet, MatIconModule, SidebarComponent, TopbarComponent, BreadcrumbsComponent],
})
export class AppShellComponent {
  private readonly router = inject(Router);
  readonly ui = inject(UiService);

  newPrediction(): void {
    this.router.navigate(['/app/predict']);
  }
}
