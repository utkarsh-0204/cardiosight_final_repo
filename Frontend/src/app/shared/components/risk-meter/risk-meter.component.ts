// =============================================================================
// Semi-circular risk gauge with needle (SVG) – risk score visualisation.
// =============================================================================
import { Component, Input } from '@angular/core';
import { NgForOf } from '@angular/common';
import type { RiskLevel } from '../../../core/models/common.model';

@Component({
  selector: 'app-risk-meter',
  template: `
    <div
      class="meter"
      [style.width.px]="size"
      [style.height.px]="size / 2 + 46"
    >
      <svg
        [attr.viewBox]="'0 0 ' + size + ' ' + (size / 2 + 46)"
        class="gauge"
        [attr.aria-label]="'Risk meter: ' + value + ' percent, ' + levelLabel"
        role="img"
      >
        <path [attr.d]="zoneGreen" class="zone zone-green" />
        <path [attr.d]="zoneAmber" class="zone zone-amber" />
        <path [attr.d]="zoneRed" class="zone zone-red" />
        <g class="ticks">
          <line *ngFor="let t of tickLines" [attr.x1]="t.x1" [attr.y1]="t.y1" [attr.x2]="t.x2" [attr.y2]="t.y2" />
        </g>
        <path [attr.d]="valueArc" class="value-arc" [attr.stroke]="levelColor" stroke-linecap="round" />
        <line
          class="needle"
          [attr.x1]="centerX"
          [attr.y1]="centerY"
          [attr.x2]="centerX"
          [attr.y2]="needleTop"
          [attr.transform]="needleTransform"
          [attr.stroke]="levelColor"
        />
        <circle [attr.cx]="centerX" [attr.cy]="centerY" r="7" class="hub" [attr.fill]="levelColor" />
        <text x="10" y="0" class="gauge-label" text-anchor="start">0</text>
        <text [attr.x]="size / 2" y="0" class="gauge-label" text-anchor="middle">50</text>
        <text [attr.x]="size - 10" y="0" class="gauge-label" text-anchor="end">100</text>
      </svg>
      <div class="meter-center">
        <span class="meter-value">{{ value }}</span>
        <span class="meter-suffix">risk score</span>
      </div>
    </div>
  `,
  styles: [
    `
      .meter {
        position: relative;
        display: inline-block;
      }
      .gauge {
        width: 100%;
        height: 100%;
        overflow: visible;
        filter: drop-shadow(0 16px 32px rgba(16, 23, 40, 0.16));
      }
      .zone {
        fill: none;
        stroke-width: 14;
        opacity: 0.2;
      }
      .zone-green {
        stroke: #43a047;
      }
      .zone-amber {
        stroke: #f9a825;
      }
      .zone-red {
        stroke: #e53935;
      }
      .value-arc {
        fill: none;
        stroke-width: 8;
        filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.24));
        transition: stroke-dashoffset 1s var(--ease-out);
      }
      .needle {
        stroke-width: 4;
        stroke-linecap: round;
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transition: transform 1s var(--ease-out);
      }
      .hub {
        stroke: var(--surface);
        stroke-width: 3;
      }
      .ticks line {
        stroke: var(--border-strong);
        stroke-width: 2;
      }
      .gauge-label {
        font-size: 13px;
        font-weight: 700;
        fill: var(--text-tertiary);
        font-variant-numeric: tabular-nums;
      }
      .meter-center {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% - 40px);
        display: flex;
        flex-direction: column;
        align-items: center;
        line-height: 1.1;
      }
      .meter-value {
        font-size: 36px;
        font-weight: 800;
        letter-spacing: -0.02em;
        background: var(--gradient-text);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        font-variant-numeric: tabular-nums;
      }
      .meter-suffix {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--text-tertiary);
      }
    `,
  ],
  standalone: true,
  imports: [NgForOf],
})
export class RiskMeterComponent {
  @Input() value = 0;
  @Input() level: RiskLevel = 'low';
  @Input() size = 240;

  private readonly radius = 8;

  get levelLabel(): string {
    return this.level;
  }

  get levelColor(): string {
    switch (this.level) {
      case 'high':
        return '#E53935';
      case 'medium':
        return '#F9A825';
      default:
        return '#43A047';
    }
  }

  private get p(): number {
    return Math.min(1, Math.max(0, this.value / 100));
  }

  get centerX(): number {
    return this.size / 2;
  }

  get centerY(): number {
    return this.size / 2 + 4;
  }

  private polar(progress: number, radius?: number): { x: number; y: number } {
    const phi = Math.PI * (1 - progress);
    const r = radius ?? this.radius;
    return {
      x: this.centerX + r * Math.cos(phi),
      y: this.centerY - r * Math.sin(phi),
    };
  }

  private arcPath(from: number, to: number): string {
    const start = this.polar(from);
    const end = this.polar(to);
    const large = to - from > 0.5 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${this.radius} ${this.radius} 0 ${large} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  // Standard Framingham / NCEP ATP III 10-Year CHD Risk Stratification:
  // - Low Risk (< 10%): Green zone [0 to 0.10]
  // - Moderate / Intermediate Risk (10% to < 20%): Amber zone [0.10 to 0.20]
  // - High Risk (>= 20%): Red zone [0.20 to 1.0]
  get zoneGreen(): string {
    return this.arcPath(0, 0.10);
  }

  get zoneAmber(): string {
    return this.arcPath(0.10, 0.20);
  }

  get zoneRed(): string {
    return this.arcPath(0.20, 1.0);
  }

  get valueArc(): string {
    return this.arcPath(0, this.p);
  }

  get needleTop(): number {
    return this.centerY - this.radius + 10;
  }

  get needleTransform(): string {
    const angle = -90 + this.p * 180;
    return `rotate(${angle.toFixed(2)} ${this.centerX} ${this.centerY})`;
  }

  get tickLines(): Array<{ x1: number; y1: number; x2: number; y2: number }> {
    const ticks: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
    for (let i = 1; i < 10; i++) {
      const inner = this.polar(i / 10, this.radius - 9);
      const outer = this.polar(i / 10, this.radius - 3);
      ticks.push({ x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y });
    }
    return ticks;
  }
}
