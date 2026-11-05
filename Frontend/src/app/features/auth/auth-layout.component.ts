// =============================================================================
// Shared split-screen layout for all authentication pages.
// =============================================================================
import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ThemeService } from '../../../core/services/theme.service';
import { AnimatedCounterComponent } from '../../../shared/components/animated-counter/animated-counter.component';
import { InViewDirective } from '../../../shared/directives/in-view.directive';

@Component({
  selector: 'app-auth-layout',
  template: `
    <div class="auth-layout">
      <aside class="auth-brand-panel">
        <a class="l-brand" routerLink="/landing">
          <span class="l-brand-mark">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M3 17h5l2.5-6 4 10 3-7 2 3h5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
              <circle cx="27" cy="6" r="3" fill="#43A047" stroke="#fff" stroke-width="1.4"/>
            </svg>
          </span>
          <span class="l-brand-name">Cardio<em>Sight</em></span>
        </a>

        <div class="ab-copy">
          <h2>Predict. Prevent. <br />Protect your heart.</h2>
          <p>
            Machine learning that reads your sleep and clinical signals to reveal your
            coronary heart disease risk — clearly and confidentially.
          </p>
          <div class="ab-stats" appInView (appInView)="statsOn.set(true)">
            <div>
              <app-counter [value]="statsOn() ? 12500 : 0" suffix="+"></app-counter>
              <span>Predictions run</span>
            </div>
            <div>
              <app-counter [value]="statsOn() ? 87 : 0" suffix="%"></app-counter>
              <span>Model accuracy</span>
            </div>
          </div>
          <div class="ab-quote">
            <mat-icon>format_quote</mat-icon>
            <p>"The sleep parameters add a dimension standard risk calculators simply miss."</p>
            <span>— Dr. Rajesh Iyer, Cardiologist</span>
          </div>
        </div>
      </aside>

      <main class="auth-main">
        <div class="auth-topbar">
          <button class="icon-btn" (click)="theme.toggle()" [attr.aria-label]="theme.isDark() ? 'Switch to light mode' : 'Switch to dark mode'">
            <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
          </button>
        </div>
        <div class="auth-stage">
          <router-outlet />
        </div>
      </main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
      }
      .auth-layout {
        display: grid;
        grid-template-columns: 1fr 1fr;
        min-height: 100vh;

        @media (max-width: 1020px) {
          grid-template-columns: 1fr;
        }
      }
      .auth-brand-panel {
        position: relative;
        overflow: hidden;
        padding: 40px 48px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        background: linear-gradient(160deg, #101827 0%, #1a2333 55%, #232f45 100%);
        color: #fff;

        @media (max-width: 1020px) {
          display: none;
        }
      }
      .l-brand {
        display: flex;
        align-items: center;
        gap: 11px;
        color: #fff;
      }
      .l-brand-mark {
        width: 42px;
        height: 42px;
        border-radius: 13px;
        background: linear-gradient(135deg, var(--primary), #8e2f2c);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: var(--shadow-primary);
      }
      .l-brand-mark svg {
        width: 25px;
        height: 25px;
      }
      .l-brand-name {
        font-size: 20px;
        font-weight: 700;
      }
      .l-brand-name em {
        font-style: normal;
        color: var(--primary-light);
      }
      .ab-copy {
        margin: 60px 0;
      }
      .ab-copy h2 {
        color: #fff;
        font-size: 40px;
        letter-spacing: -0.02em;
        line-height: 1.15;
        margin-bottom: 18px;
      }
      .ab-copy > p {
        color: rgba(255, 255, 255, 0.72);
        font-size: 16px;
        max-width: 430px;
        line-height: 1.7;
      }
      .ab-stats {
        display: flex;
        gap: 48px;
        margin-top: 40px;
        padding: 22px 0;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
      }
      .ab-stats app-counter {
        display: block;
        font-size: 30px;
        font-weight: 800;
        color: #fff;
      }
      .ab-stats span {
        font-size: 12.5px;
        color: rgba(255, 255, 255, 0.6);
      }
      .ab-quote {
        margin-top: 34px;
        max-width: 420px;
      }
      .ab-quote mat-icon {
        color: var(--primary-light);
        font-size: 30px;
        height: 30px;
        width: 30px;
      }
      .ab-quote p {
        margin: 10px 0 8px;
        color: rgba(255, 255, 255, 0.85);
        font-size: 15px;
        line-height: 1.6;
      }
      .ab-quote span {
        font-size: 12.5px;
        color: rgba(255, 255, 255, 0.55);
      }
      .auth-main {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 28px 20px;
        position: relative;
      }
      .auth-topbar {
        position: absolute;
        top: 24px;
        right: 28px;
      }
      .icon-btn {
        width: 40px;
        height: 40px;
        border-radius: 12px;
        border: none;
        background: transparent;
        color: var(--text-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .icon-btn:hover {
        background: var(--surface-muted);
        color: var(--primary);
      }
      .auth-stage {
        width: 100%;
        max-width: 460px;
      }
    `,
  ],
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatIconModule, AnimatedCounterComponent, InViewDirective],
})
export class AuthLayoutComponent {
  readonly theme = inject(ThemeService);
  readonly statsOn = signal(false);
}
