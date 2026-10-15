// =============================================================================
// Prediction result page – Framingham risk assessment + ECG & TMT investigations.
// =============================================================================

import { Component, computed, inject, OnDestroy, OnInit, signal } from "@angular/core";
import { ActivatedRoute, RouterLink } from "@angular/router";
import { CommonModule, DatePipe } from "@angular/common";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { Subscription, catchError, of, timeout } from "rxjs";

import { RiskMeterComponent } from "../../shared/components/risk-meter/risk-meter.component";
import { CircularProgressComponent } from "../../shared/components/circular-progress/circular-progress.component";
import {
  ChartWidgetComponent,
  type ChartDataset,
  type ChartWidgetOptions,
} from "../../shared/components/chart-widget/chart-widget.component";
import { PredictionService } from "../../core/services/prediction.service";
import { ToastService } from "../../core/services/toast.service";

import type {
  ExplanationResult,
  FactorContribution,
  FeatureContribution,
  PredictionResult,
  WaterfallStep,
} from "../../core/models/prediction.model";

@Component({
  selector: "app-prediction-result",
  templateUrl: "./prediction-result.component.html",
  styleUrl: "./prediction-result.component.scss",
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    DatePipe,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    RiskMeterComponent,
    CircularProgressComponent,
    ChartWidgetComponent,
  ],
})
export class PredictionResultComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly prediction = inject(PredictionService);
  private readonly toast = inject(ToastService);

  private resultSub?: Subscription;
  private explanationSub?: Subscription;

  readonly predictionId = signal<string>("");
  readonly loading = signal(true);
  readonly result = signal<PredictionResult | null>(null);

  readonly explanation = signal<ExplanationResult | null>(null);
  readonly explanationLoading = signal<boolean>(true);
  readonly explanationError = signal<string | null>(null);


  // Global feature importance chart data
  readonly globalChartLabels = computed(() => {
    return this.explanation()?.global_feature_importance.map((g) => g.label) ?? [];
  });

  readonly globalChartDatasets = computed<ChartDataset[]>(() => {
    const gfi = this.explanation()?.global_feature_importance;
    if (!gfi) return [];
    return [
      {
        label: "Relative Importance (%)",
        data: gfi.map((g) => g.importance),
        backgroundColor: "rgba(0, 137, 123, 0.75)",
        borderColor: "#00897b",
        borderWidth: 1.5,
        borderRadius: 6,
      },
    ];
  });

  readonly globalChartOptions: ChartWidgetOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => ` Relative Importance: ${ctx.parsed.x}%`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Model-Wide Gini Importance (%)",
          color: "#5a6b7f",
        },
        grid: { color: "rgba(26, 35, 51, 0.06)" },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 12 } },
      },
    },
  };

  // SHAP Individual Feature Contributions Chart
  readonly shapChartLabels = computed(() => {
    const steps = this.explanation()?.feature_contributions;
    if (!steps) return [];
    const sorted = [...steps].sort((a, b) => Math.abs(b.contribution_pct) - Math.abs(a.contribution_pct));
    return sorted.map((s) => `${s.label} (${s.formatted_value})`);
  });

  readonly shapChartDatasets = computed<ChartDataset[]>(() => {
    const steps = this.explanation()?.feature_contributions;
    if (!steps) return [];
    const sorted = [...steps].sort((a, b) => Math.abs(b.contribution_pct) - Math.abs(a.contribution_pct));
    return [
      {
        label: "SHAP Impact on Probability (%)",
        data: sorted.map((s) => s.contribution_pct),
        backgroundColor: sorted.map((s) =>
          s.contribution_pct >= 0 ? "rgba(229, 57, 53, 0.85)" : "rgba(67, 160, 71, 0.85)"
        ),
        borderColor: sorted.map((s) => (s.contribution_pct >= 0 ? "#e53935" : "#43a047")),
        borderWidth: 1.5,
        borderRadius: 4,
      },
    ];
  });

  readonly shapChartOptions: ChartWidgetOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.parsed.x;
            return ` Impact on Predicted Risk: ${val > 0 ? "+" : ""}${val}%`;
          },
        },
      },
    },
    scales: {
      x: {
        title: {
          display: true,
          text: "SHAP Risk Shift vs. Baseline Prior (%)",
          color: "#5a6b7f",
        },
        grid: { color: "rgba(26, 35, 51, 0.08)" },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 11.5 } },
      },
    },
  };

  readonly meterColor: Record<string, string> = {
    low: "#43A047",
    medium: "#F9A825",
    high: "#E53935",
  };

  readonly hasEcg = computed(() => {
    const ecg = this.result()?.ecg;
    return Boolean(ecg && ecg.status && ecg.status !== "error");
  });

  readonly hasTmt = computed(() => {
    const tmt = this.result()?.tmt;
    return Boolean(tmt && tmt.status && tmt.status !== "error");
  });

  readonly allWarnings = computed(() => {
    const warnings: string[] = [];
    const r = this.result();
    if (r?.ecg?.warnings) {
      warnings.push(...r.ecg.warnings);
    }
    if (r?.tmt?.warnings) {
      warnings.push(...r.tmt.warnings);
    }
    return warnings;
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get("id") ?? "";
    this.predictionId.set(id);

    if (!id) {
      this.loading.set(false);
      this.explanationLoading.set(false);
      this.explanationError.set("Prediction ID was not specified.");
      return;
    }

    this.resultSub = this.prediction.getResult(id).subscribe({
      next: (res) => {
        this.result.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error(
          "Result unavailable",
          "We could not load this prediction."
        );
      },
    });

    this.loadExplanation(id);
  }

  loadExplanation(id: string): void {
    if (!id) return;

    // Prevent duplicate in-flight requests if already loading
    if (this.explanationSub && !this.explanationSub.closed) {
      this.explanationSub.unsubscribe();
    }

    this.explanationLoading.set(true);
    this.explanationError.set(null);

    // Sensible 15-second client timeout ensures the spinner never spins forever
    this.explanationSub = this.prediction
      .getExplanation(id)
      .pipe(
        timeout(15000),
        catchError((err) => {
          console.warn("[PredictionResult] SHAP explanation request failed or timed out:", err);
          return of({
            error: true,
            message:
              err?.name === "TimeoutError"
                ? "The mathematical SHAP calculation took longer than expected. Please click 'Retry' to request explanations again."
                : err?.error?.message ||
                  err?.message ||
                  "Explainable AI insights are currently unavailable for this prediction.",
          });
        })
      )
      .subscribe({
        next: (res: any) => {
          this.explanationLoading.set(false);
          if (res?.error) {
            this.explanationError.set(res.message);
          } else {
            this.explanation.set(res);
            this.explanationError.set(null);
          }
        },
        error: (err) => {
          this.explanationLoading.set(false);
          this.explanationError.set(
            err?.error?.message ||
              "Explainable AI insights are currently unavailable for this prediction."
          );
        },
      });
  }

  retryExplanation(): void {
    const id = this.predictionId();
    if (id) {
      this.loadExplanation(id);
    }
  }

  ngOnDestroy(): void {
    this.resultSub?.unsubscribe();
    this.explanationSub?.unsubscribe();
  }

  factorWidth(f: FactorContribution): string {
    return `${Math.min(100, Math.abs(f.impact) * 100)}%`;
  }

  factorBarClass(f: FactorContribution): string {
    if (f.impact > 0.2) return "negative";
    if (f.impact < -0.2) return "positive";
    return "neutral";
  }

  metricSummary(): string {
    const r = this.result();
    if (!r) return "";
    const { sysBP, diaBP, totChol, glucose } = r.input;
    return `${sysBP}/${diaBP} BP · ${totChol} mg/dL cholesterol · ${glucose} mg/dL glucose`;
  }

  downloadReport(): void {
    const r = this.result();
    if (!r) return;

    const payload = {
      id: r.id,
      framinghamChdRisk: {
        riskScore: r.riskScore,
        riskLevel: r.riskLevel,
        confidence: r.confidence,
        diseaseProbability: r.diseaseProbability,
        contributingFactors: r.contributingFactors,
        recommendations: r.recommendations,
      },
      ecgReportFindings: r.ecg || "Not provided / skipped",
      tmtReportFindings: r.tmt || "Not provided / skipped",
      patientInput: r.input,
      submittedAt: r.submittedAt,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cardiosight-comprehensive-report-${r.id}.json`;
    a.click();
    URL.revokeObjectURL(url);

    this.toast.success("Report downloaded", "Comprehensive report saved.");
  }

  shareReport(): void {
    const r = this.result();
    if (!r) return;

    const sex = r.input.male === 1 ? "Male" : "Female";
    let text =
      `CardioSight Cardiovascular Profile:\n` +
      `• Framingham 10-Yr CHD Risk: ${r.riskScore}/100 (${r.riskLevel.toUpperCase()}, ${r.diseaseProbability}% prob)\n` +
      `• Age: ${r.input.age}, Sex: ${sex}\n`;

    if (r.ecg) {
      text += `• ECG Status: ${r.ecg.status.toUpperCase()} (${r.ecg.interpretationSummary})\n`;
    }
    if (r.tmt) {
      const dts = r.tmt.dukeTreadmillScore?.riskCategory || "Available";
      text += `• TMT Exercise Stress: ${r.tmt.status.toUpperCase()} (Duke Score: ${dts})\n`;
    }

    if (navigator.share) {
      navigator
        .share({ title: "CardioSight Comprehensive Report", text })
        .catch(() => undefined);
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      this.toast.success("Copied to clipboard", "Summary copied for clinical review.");
    }
  }
}
