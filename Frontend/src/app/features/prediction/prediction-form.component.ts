import { Component, computed, inject, signal } from "@angular/core";
import { Router } from "@angular/router";
import { NgSwitch, NgSwitchCase, CommonModule } from "@angular/common";
import { FormBuilder, ReactiveFormsModule, Validators } from "@angular/forms";

import { MatFormFieldModule } from "@angular/material/form-field";
import { MatInputModule } from "@angular/material/input";
import { MatSelectModule } from "@angular/material/select";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatSlideToggleModule } from "@angular/material/slide-toggle";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { finalize } from "rxjs";

import { PredictionService } from "../../core/services/prediction.service";
import { ToastService } from "../../core/services/toast.service";
import type {
  EcgInput,
  PredictionInput,
  TmtInput,
} from "../../core/models/prediction.model";

interface Step {
  id: number;
  icon: string;
  title: string;
  subtitle: string;
  controls: string[];
}

const STEPS: Step[] = [
  {
    id: 1,
    icon: "person",
    title: "Personal",
    subtitle: "Age, sex and education",
    controls: ["age", "male", "education"],
  },
  {
    id: 2,
    icon: "smoking_rooms",
    title: "Lifestyle",
    subtitle: "Smoking information",
    controls: ["currentSmoker", "cigsPerDay"],
  },
  {
    id: 3,
    icon: "medical_services",
    title: "Medical History",
    subtitle: "Existing conditions",
    controls: ["BPMeds", "prevalentStroke", "prevalentHyp", "diabetes"],
  },
  {
    id: 4,
    icon: "monitor_heart",
    title: "Clinical",
    subtitle: "Measurements",
    controls: ["totChol", "sysBP", "diaBP", "BMI", "heartRate", "glucose"],
  },
  {
    id: 5,
    icon: "biotech",
    title: "Investigations",
    subtitle: "Optional ECG & TMT",
    controls: [], // completely optional
  },
  {
    id: 6,
    icon: "fact_check",
    title: "Review",
    subtitle: "Confirm details",
    controls: [],
  },
];

@Component({
  selector: "app-prediction-form",
  templateUrl: "./prediction-form.component.html",
  styleUrl: "./prediction-form.component.scss",
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    NgSwitch,
    NgSwitchCase,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
  ],
})
export class PredictionFormComponent {
  private readonly fb = inject(FormBuilder);
  private readonly prediction = inject(PredictionService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly steps = STEPS;
  readonly currentStep = signal(1);
  readonly submitting = signal(false);

  // 15 Standard Framingham Inputs (Strictly preserved)
  readonly form = this.fb.nonNullable.group({
    age: [50, [Validators.required, Validators.min(18), Validators.max(100)]],
    male: [1 as 0 | 1, Validators.required],
    education: [
      2 as 1 | 2 | 3 | 4,
      [Validators.required, Validators.min(1), Validators.max(4)],
    ],
    currentSmoker: [0 as 0 | 1],
    cigsPerDay: [
      0,
      [Validators.required, Validators.min(0), Validators.max(100)],
    ],
    BPMeds: [0 as 0 | 1],
    prevalentStroke: [0 as 0 | 1],
    prevalentHyp: [0 as 0 | 1],
    diabetes: [0 as 0 | 1],
    totChol: [
      200,
      [Validators.required, Validators.min(80), Validators.max(400)],
    ],
    sysBP: [
      120,
      [Validators.required, Validators.min(70), Validators.max(260)],
    ],
    diaBP: [80, [Validators.required, Validators.min(40), Validators.max(160)]],
    BMI: [25, [Validators.required, Validators.min(10), Validators.max(70)]],
    heartRate: [
      75,
      [Validators.required, Validators.min(35), Validators.max(220)],
    ],
    glucose: [
      100,
      [Validators.required, Validators.min(40), Validators.max(400)],
    ],
  });

  // ---------------------------------------------------------------------------
  // Optional Step 5: ECG Investigation State & Form
  // ---------------------------------------------------------------------------
  readonly ecgMode = signal<"upload" | "manual">("upload");
  readonly ecgReportType = signal<"standard_12_lead" | "single_lead">("standard_12_lead");
  readonly ecgFile = signal<File | null>(null);
  readonly ecgFileName = signal<string>("");
  readonly ecgParsing = signal<boolean>(false);
  readonly ecgWarnings = signal<string[]>([]);
  readonly ecgStatus = signal<string>("");
  readonly ecgExtracted = signal<boolean>(false);
  readonly ecgFieldSources = signal<Record<string, string>>({});
  readonly ecgExtractedSummary = signal<string[]>([]);
  readonly ecgManualReviewSummary = signal<string[]>([]);
  readonly ecgUnsupportedSummary = signal<string[]>([]);
  readonly ecgMissingSummary = signal<string[]>([]);
  readonly ecgDocProcessing = signal<{ isScanned: boolean; ocrApplied: boolean; ocrNotice?: string | null; pageCount: number; statusText: string } | null>(null);
  readonly ecgFormVersion = signal<number>(0);
  readonly tmtFormVersion = signal<number>(0);

  readonly ecgForm = this.fb.group({
    recordingDate: [""],
    heartRate: [null as number | null, [Validators.min(30), Validators.max(250)]],
    prInterval: [null as number | null, [Validators.min(80), Validators.max(400)]],
    qrsDuration: [null as number | null, [Validators.min(40), Validators.max(250)]],
    qtInterval: [null as number | null, [Validators.min(200), Validators.max(700)]],
    qtcInterval: [null as number | null, [Validators.min(300), Validators.max(650)]],
    stFindings: [null as string | null],
    tWaveFindings: [null as string | null],
    rhythm: [null as string | null],
    interpretation: [""],
  });

  // ---------------------------------------------------------------------------
  // Optional Step 5: TMT Investigation State & Form
  // ---------------------------------------------------------------------------
  readonly tmtMode = signal<"upload" | "manual">("upload");
  readonly tmtFile = signal<File | null>(null);
  readonly tmtFileName = signal<string>("");
  readonly tmtParsing = signal<boolean>(false);
  readonly tmtWarnings = signal<string[]>([]);
  readonly tmtStatus = signal<string>("");
  readonly tmtExtracted = signal<boolean>(false);
  readonly tmtFieldSources = signal<Record<string, string>>({});
  readonly tmtIsMismatch = signal<boolean>(false);
  readonly tmtMismatchMessage = signal<string>("");
  readonly tmtExtractedSummary = signal<string[]>([]);
  readonly tmtManualReviewSummary = signal<string[]>([]);
  readonly tmtMissingSummary = signal<string[]>([]);
  readonly tmtFieldPages = signal<Record<string, number | null>>({});
  readonly tmtDtsReported = signal<boolean>(false);
  readonly tmtReportedDts = signal<number | null>(null);
  readonly tmtDocProcessing = signal<{ isScanned: boolean; ocrApplied: boolean; ocrNotice?: string | null; pageCount: number; statusText: string } | null>(null);
  readonly tmtClinicalStatusText = signal<string>("");

  readonly tmtManualSummary = computed(() => {
    const sources = this.tmtFieldSources();
    const val = this.tmtForm.value;
    const manualFields: string[] = [];
    const fieldLabels: Record<string, string> = {
      protocol: 'Exercise Protocol',
      durationMinutes: 'Exercise Duration',
      mets: 'Workload (METs)',
      restingHR: 'Resting HR',
      thalach: 'Max HR (thalach)',
      restingBP: 'Resting BP',
      peakBP: 'Peak Exercise BP',
      exang: 'Exercise-Induced Angina',
      oldpeak: 'ST Depression (oldpeak)',
      slope: 'Peak ST Segment Slope',
      restecg: 'Resting ECG',
      tmtResult: 'Diagnostic Conclusion',
      reportedConclusion: 'Reported Diagnosis / Notes',
    };
    for (const [key, label] of Object.entries(fieldLabels)) {
      if (sources[key] === 'manual' && (val as any)[key] != null && (val as any)[key] !== '') {
        manualFields.push(label);
      }
    }
    return manualFields;
  });

  readonly tmtForm = this.fb.group({
    protocol: ["Standard Bruce"],
    durationMinutes: [null as number | null, [Validators.min(0.5), Validators.max(45)]],
    durationFormatted: [""],
    mets: [null as number | null, [Validators.min(1), Validators.max(30)]],
    restingHR: [null as number | null, [Validators.min(40), Validators.max(200)]],
    thalach: [null as number | null, [Validators.min(50), Validators.max(240)]],
    restingBP: [""],
    peakBP: [""],
    exang: [null as number | null], // 0 = No, 1 = Yes
    oldpeak: [null as number | null, [Validators.min(0), Validators.max(10)]],
    slope: [null as number | null], // 1 = Upsloping, 2 = Flat, 3 = Downsloping
    restecg: [null as number | null], // 0 = Normal, 1 = ST-T wave abnormality, 2 = LVH
    tmtResult: [null as string | null],
    reportedConclusion: [""],
  });

  constructor() {
    this.ecgForm.valueChanges.subscribe(() => this.ecgFormVersion.update((v) => v + 1));
    this.tmtForm.valueChanges.subscribe(() => this.tmtFormVersion.update((v) => v + 1));
  }

  readonly progress = computed(() =>
    Math.round(((this.currentStep() - 1) / (STEPS.length - 1)) * 100)
  );

  readonly isFirstStep = computed(() => this.currentStep() === 1);
  readonly isLastStep = computed(() => this.currentStep() === STEPS.length);

  readonly maxPredictedHR = computed(() => {
    const age = this.form.controls.age.value || 50;
    return Math.max(100, 220 - age);
  });

  readonly predictedPercentMaxHR = computed(() => {
    this.tmtFormVersion();
    const peakHR = this.tmtForm.controls.thalach.value;
    if (!peakHR) return null;
    return Math.round((peakHR / this.maxPredictedHR()) * 100);
  });

  readonly dukeTreadmillScorePreview = computed<number | null>(() => {
    this.tmtFormVersion();
    // Do not fabricate or calculate DTS if report was uploaded without an explicitly reported DTS
    if (this.tmtExtracted() && !this.tmtDtsReported()) {
      return null;
    }
    if (this.tmtDtsReported() && this.tmtReportedDts() !== null) {
      return this.tmtReportedDts();
    }
    // In manual mode without an uploaded report, allow preview calculation
    const duration = this.tmtForm.controls.durationMinutes.value;
    const oldpeak = this.tmtForm.controls.oldpeak.value;
    const exang = this.tmtForm.controls.exang.value;
    if (duration == null || oldpeak == null) return null;
    const anginaIndex = exang === 1 ? 1 : 0;
    const score = duration - (5 * oldpeak) - (4 * anginaIndex);
    return Math.round(score * 10) / 10;
  });

  readonly dukeRiskCategory = computed<string>(() => {
    const score = this.dukeTreadmillScorePreview();
    if (score == null) {
      return this.tmtExtracted() && !this.tmtDtsReported() ? "Not Reported on Document" : "Unknown";
    }
    if (score >= 5) return "Low Risk (Score ≥ +5)";
    if (score >= -10) return "Moderate Risk (Score -10 to +4)";
    return "High Risk (Score ≤ -11)";
  });

  getEducationLabel(level: number): string {
    switch (level) {
      case 1: return "Level 1 (Some High School)";
      case 2: return "Level 2 (High School / GED)";
      case 3: return "Level 3 (Some College / Vocational)";
      case 4: return "Level 4 (College Degree)";
      default: return `Level ${level}`;
    }
  }

  getSlopeLabel(slope: number | null | undefined): string {
    if (slope === 1) return "1 - Upsloping (Low risk)";
    if (slope === 2) return "2 - Flat / Horizontal (Moderate risk)";
    if (slope === 3) return "3 - Downsloping (High ischemic risk)";
    return "Not Reported";
  }

  getRestecgLabel(restecg: number | null | undefined): string {
    if (restecg === 0) return "0 - Normal baseline";
    if (restecg === 1) return "1 - ST-T wave abnormality";
    if (restecg === 2) return "2 - Left ventricular hypertrophy (LVH)";
    return "Not Reported";
  }

  readonly hasEcgData = computed(() => {
    this.ecgFormVersion();
    const val = this.ecgForm.value;
    return Boolean(
      val.heartRate != null ||
      val.prInterval != null ||
      val.qrsDuration != null ||
      val.qtInterval != null ||
      val.qtcInterval != null ||
      val.stFindings != null ||
      val.tWaveFindings != null ||
      val.rhythm != null ||
      (val.interpretation && val.interpretation.trim().length > 0)
    );
  });

  readonly hasTmtData = computed(() => {
    this.tmtFormVersion();
    const val = this.tmtForm.value;
    return Boolean(
      val.exang !== null ||
      val.oldpeak !== null ||
      val.slope !== null ||
      val.thalach !== null ||
      val.restingHR !== null ||
      val.restecg !== null ||
      val.mets !== null ||
      val.durationMinutes !== null ||
      (val.reportedConclusion && val.reportedConclusion.trim().length > 0)
    );
  });

  stepFor(id: number): Step {
    return STEPS[id - 1];
  }

  isCurrent(id: number): boolean {
    return this.currentStep() === id;
  }

  isDone(id: number): boolean {
    return this.currentStep() > id;
  }

  goToStep(id: number): void {
    const target = this.stepFor(id);
    if (id < this.currentStep() || this.validateControls(target.controls)) {
      this.currentStep.set(id);
    }
  }

  next(): void {
    const step = this.stepFor(this.currentStep());
    if (this.validateControls(step.controls)) {
      this.currentStep.update((v) => Math.min(v + 1, STEPS.length));
    }
  }

  back(): void {
    this.currentStep.update((v) => Math.max(v - 1, 1));
  }

  skipBothInvestigations(): void {
    this.clearEcg();
    this.clearTmt();
    this.toast.info("Investigations Skipped", "Proceeding directly to final review.");
    this.goToStep(6);
  }

  private validateControls(controls: string[]): boolean {
    if (controls.length === 0) {
      return true;
    }
    const controlsToValidate = controls
      .map((name) => this.form.get(name))
      .filter((control) => control !== null);
    controlsToValidate.forEach((control) => control!.markAsTouched());
    return controlsToValidate.every((control) => control!.valid);
  }

  // ---------------------------------------------------------------------------
  // ECG File Upload & Parsing Handler
  // ---------------------------------------------------------------------------
  onEcgFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      this.toast.error("Invalid file format", "Only PDF ECG reports are supported.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.toast.error("File too large", "Maximum file size for ECG reports is 10MB.");
      return;
    }

    this.ecgFile.set(file);
    this.ecgFileName.set(file.name);
    this.ecgParsing.set(true);
    this.ecgWarnings.set([]);

    this.prediction.parseEcg(file).subscribe({
      next: (res) => {
        this.ecgParsing.set(false);
        this.ecgExtracted.set(true);
        this.ecgStatus.set(res.extractionStatus);
        this.ecgWarnings.set(res.warnings || []);

        const isSingleLead = res.modality === "single_lead" ||
          res.fields?.prInterval?.status === "unsupported" ||
          file.name.toLowerCase().includes("whoop") ||
          file.name.toLowerCase().includes("apple") ||
          file.name.toLowerCase().includes("single");

        this.ecgReportType.set(isSingleLead ? "single_lead" : "standard_12_lead");

        const sources: Record<string, string> = {};
        let extractedFieldCount = 0;

        if (res.fields) {
          // 1. Heart Rate
          if (res.fields.heartRate?.value != null) {
            this.ecgForm.patchValue({ heartRate: res.fields.heartRate.value });
            sources["heartRate"] = res.fields.heartRate.status;
            extractedFieldCount++;
          } else {
            this.ecgForm.patchValue({ heartRate: null });
            sources["heartRate"] = "not_found";
          }

          // 2. Recording Date
          if (res.fields.recordingDate?.value) {
            this.ecgForm.patchValue({ recordingDate: res.fields.recordingDate.value });
            sources["recordingDate"] = res.fields.recordingDate.status;
          }

          // 3. Rhythm (never assign a default like AFib when unparsed)
          if (res.fields.rhythm?.value != null) {
            this.ecgForm.patchValue({ rhythm: res.fields.rhythm.value });
            sources["rhythm"] = res.fields.rhythm.status;
            extractedFieldCount++;
          } else {
            this.ecgForm.patchValue({ rhythm: null });
            sources["rhythm"] = "not_found";
          }

          // 4. 12-lead intervals
          if (isSingleLead) {
            this.ecgForm.patchValue({
              prInterval: null,
              qrsDuration: null,
              qtInterval: null,
              qtcInterval: null,
              stFindings: null,
              tWaveFindings: null,
            });
            sources["prInterval"] = "unsupported";
            sources["qrsDuration"] = "unsupported";
            sources["qtInterval"] = "unsupported";
            sources["qtcInterval"] = "unsupported";
            sources["stFindings"] = "unsupported";
            sources["tWaveFindings"] = "unsupported";
          } else {
            if (res.fields.prInterval?.value != null) {
              this.ecgForm.patchValue({ prInterval: res.fields.prInterval.value });
              sources["prInterval"] = res.fields.prInterval.status;
              extractedFieldCount++;
            }
            if (res.fields.qrsDuration?.value != null) {
              this.ecgForm.patchValue({ qrsDuration: res.fields.qrsDuration.value });
              sources["qrsDuration"] = res.fields.qrsDuration.status;
              extractedFieldCount++;
            }
            if (res.fields.qtInterval?.value != null) {
              this.ecgForm.patchValue({ qtInterval: res.fields.qtInterval.value });
              sources["qtInterval"] = res.fields.qtInterval.status;
              extractedFieldCount++;
            }
            if (res.fields.qtcInterval?.value != null) {
              this.ecgForm.patchValue({ qtcInterval: res.fields.qtcInterval.value });
              sources["qtcInterval"] = res.fields.qtcInterval.status;
              extractedFieldCount++;
            }
            if (res.fields.stFindings?.value != null) {
              this.ecgForm.patchValue({ stFindings: res.fields.stFindings.value });
              sources["stFindings"] = res.fields.stFindings.status;
              extractedFieldCount++;
            }
            if (res.fields.tWaveFindings?.value != null) {
              this.ecgForm.patchValue({ tWaveFindings: res.fields.tWaveFindings.value });
              sources["tWaveFindings"] = res.fields.tWaveFindings.status;
              extractedFieldCount++;
            }
          }
        }

        // 5. Written Diagnosis / Interpretation
        if (res.reportedDiagnosis) {
          this.ecgForm.patchValue({ interpretation: res.reportedDiagnosis });
          sources["interpretation"] = "extracted";
          extractedFieldCount++;
        }

        this.ecgFieldSources.set(sources);
        this.ecgDocProcessing.set(res.docProcessing || null);
        this.ecgExtractedSummary.set(res.extractedFieldsSummary || []);
        this.ecgManualReviewSummary.set(res.manualReviewFieldsSummary || []);
        this.ecgUnsupportedSummary.set(res.unsupportedFieldsSummary || []);
        this.ecgMissingSummary.set(res.missingFieldsSummary || []);

        if (res.extractionStatus === "empty" || extractedFieldCount === 0) {
          this.toast.warning(
            "No Measurements Extracted",
            res.warnings?.[0] || "The document contains no readable ECG measurements. Please enter values manually."
          );
        } else if (isSingleLead && res.fields?.heartRate?.value != null && res.fields?.rhythm?.value != null) {
          this.toast.success(
            "Wearable ECG Extracted",
            `Extracted Heart Rate (${res.fields.heartRate.value} BPM) and Rhythm (${res.fields.rhythm.value}).`
          );
        } else if (res.extractionStatus === "partial") {
          this.toast.info(
            "Partial ECG Extracted",
            "Some values were extracted. Please review and enter any missing parameters."
          );
        } else {
          this.toast.success("ECG Report Parsed", "All clinical parameters were successfully extracted.");
        }
      },
      error: (err) => {
        this.ecgParsing.set(false);
        const msg = err.error?.message || "Failed to parse ECG PDF report.";
        this.ecgWarnings.set([msg]);
        this.toast.error("ECG Extraction Error", msg);
      },
    });
  }

  clearEcg(): void {
    this.ecgFile.set(null);
    this.ecgFileName.set("");
    this.ecgParsing.set(false);
    this.ecgWarnings.set([]);
    this.ecgExtracted.set(false);
    this.ecgStatus.set("");
    this.ecgFieldSources.set({});
    this.ecgExtractedSummary.set([]);
    this.ecgManualReviewSummary.set([]);
    this.ecgUnsupportedSummary.set([]);
    this.ecgMissingSummary.set([]);
    this.ecgDocProcessing.set(null);
    this.ecgReportType.set("standard_12_lead");
    this.ecgForm.reset({
      recordingDate: "",
      heartRate: null,
      prInterval: null,
      qrsDuration: null,
      qtInterval: null,
      qtcInterval: null,
      stFindings: null,
      tWaveFindings: null,
      rhythm: null,
      interpretation: "",
    });
  }

  // ---------------------------------------------------------------------------
  // TMT File Upload & Parsing Handler
  // ---------------------------------------------------------------------------
  onTmtFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      this.toast.error("Invalid file format", "Only PDF TMT reports are supported.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.toast.error("File too large", "Maximum file size for TMT reports is 10MB.");
      return;
    }

    this.tmtFile.set(file);
    this.tmtFileName.set(file.name);
    this.tmtParsing.set(true);
    this.tmtWarnings.set([]);
    this.tmtIsMismatch.set(false);
    this.tmtMismatchMessage.set("");

    this.prediction.parseTmt(file).subscribe({
      next: (res) => {
        this.tmtParsing.set(false);

        // Document Mismatch Handling: PDF is actually an ECG report, not a TMT report
        if (res.isMismatch || res.extractionStatus === "document_mismatch") {
          const mismatchMsg =
            res.warnings?.[0] ||
            "This appears to be an ECG report, not a TMT report. Please upload the correct document.";
          this.tmtIsMismatch.set(true);
          this.tmtMismatchMessage.set(mismatchMsg);
          this.tmtExtracted.set(false);
          this.tmtStatus.set("document_mismatch");
          this.tmtWarnings.set([mismatchMsg]);
          this.tmtExtractedSummary.set([]);
          this.tmtMissingSummary.set(res.missingFieldsSummary || []);
          this.toast.error("Document Type Mismatch", mismatchMsg);
          return;
        }

        this.tmtIsMismatch.set(false);
        this.tmtMismatchMessage.set("");
        this.tmtExtracted.set(true);
        this.tmtStatus.set(res.extractionStatus);
        this.tmtWarnings.set(res.warnings || []);
        this.tmtExtractedSummary.set(res.extractedFieldsSummary || []);
        this.tmtMissingSummary.set(res.missingFieldsSummary || []);

        const fieldPages: Record<string, number | null> = {};
        const sources: Record<string, string> = {};
        let extractedFieldCount = 0;
        if (res.fields) {
          for (const [key, field] of Object.entries(res.fields)) {
            if ((field as any)?.page) {
              fieldPages[key] = (field as any).page;
            }
          }

          if (res.fields.exang?.value != null) {
            this.tmtForm.patchValue({ exang: res.fields.exang.value });
            sources["exang"] = res.fields.exang.status;
            extractedFieldCount++;
          }
          if (res.fields.oldpeak?.value != null) {
            this.tmtForm.patchValue({ oldpeak: res.fields.oldpeak.value });
            sources["oldpeak"] = res.fields.oldpeak.status;
            extractedFieldCount++;
          }
          if (res.fields.slope?.value != null) {
            this.tmtForm.patchValue({ slope: res.fields.slope.value });
            sources["slope"] = res.fields.slope.status;
            extractedFieldCount++;
          }
          if (res.fields.thalach?.value != null) {
            this.tmtForm.patchValue({ thalach: res.fields.thalach.value });
            sources["thalach"] = res.fields.thalach.status;
            extractedFieldCount++;
          }
          if (res.fields.restingHR?.value != null) {
            this.tmtForm.patchValue({ restingHR: res.fields.restingHR.value });
            sources["restingHR"] = res.fields.restingHR.status;
            extractedFieldCount++;
          }
          if (res.fields.restingBP?.value != null) {
            this.tmtForm.patchValue({ restingBP: res.fields.restingBP.value });
            sources["restingBP"] = res.fields.restingBP.status;
            extractedFieldCount++;
          }
          if (res.fields.peakBP?.value != null) {
            this.tmtForm.patchValue({ peakBP: res.fields.peakBP.value });
            sources["peakBP"] = res.fields.peakBP.status;
            extractedFieldCount++;
          }
          if (res.fields.restecg?.value != null) {
            this.tmtForm.patchValue({ restecg: res.fields.restecg.value });
            sources["restecg"] = res.fields.restecg.status;
            extractedFieldCount++;
          }
          if (res.fields.mets?.value != null) {
            this.tmtForm.patchValue({ mets: res.fields.mets.value });
            sources["mets"] = res.fields.mets.status;
            extractedFieldCount++;
          }
          if (res.fields.durationMinutes?.value != null) {
            this.tmtForm.patchValue({ durationMinutes: res.fields.durationMinutes.value });
            sources["durationMinutes"] = res.fields.durationMinutes.status;
            extractedFieldCount++;
          }
          const dFmt = res.durationFormatted || res.fields?.durationMinutes?.formatted || res.fields?.durationFormatted?.value;
          if (dFmt) {
            this.tmtForm.patchValue({ durationFormatted: dFmt });
            sources["durationFormatted"] = "extracted";
          } else if (res.fields.durationMinutes?.value != null) {
            const m = Math.floor(res.fields.durationMinutes.value);
            const s = Math.round((res.fields.durationMinutes.value - m) * 60);
            this.tmtForm.patchValue({ durationFormatted: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` });
          }
          if (res.fields.protocol?.value != null) {
            this.tmtForm.patchValue({ protocol: res.fields.protocol.value });
            sources["protocol"] = res.fields.protocol.status;
            extractedFieldCount++;
          }
        }
        if (res.tmtResult || res.fields?.tmtResult?.value) {
          const resVal = res.tmtResult || res.fields?.tmtResult?.value;
          this.tmtForm.patchValue({ tmtResult: resVal });
          sources["tmtResult"] = "extracted";
          extractedFieldCount++;
        }
        if (res.reportedConclusion) {
          this.tmtForm.patchValue({ reportedConclusion: res.reportedConclusion });
          sources["reportedConclusion"] = "extracted";
          extractedFieldCount++;
        }
        this.tmtFieldSources.set(sources);
        this.tmtFieldPages.set(fieldPages);
        this.tmtDocProcessing.set(res.docProcessing || null);
        this.tmtClinicalStatusText.set(res.clinicalExtraction?.statusText || "");
        this.tmtExtractedSummary.set(res.extractedFieldsSummary || []);
        this.tmtManualReviewSummary.set(res.manualReviewFieldsSummary || []);
        this.tmtMissingSummary.set(res.missingFieldsSummary || []);

        if (res.reportedDts !== null && res.reportedDts !== undefined) {
          this.tmtDtsReported.set(true);
          this.tmtReportedDts.set(res.reportedDts);
        } else {
          this.tmtDtsReported.set(false);
          this.tmtReportedDts.set(null);
        }

        if (res.extractionStatus === "empty" || extractedFieldCount === 0) {
          this.toast.warning(
            "No Measurements Extracted",
            res.warnings?.[0] || "The document contains no readable TMT measurements. Please enter values manually."
          );
        } else if (res.extractionStatus === "partial" || extractedFieldCount < 3) {
          this.toast.info(
            "Partial TMT Extracted",
            "Some TMT values were extracted. Please review and enter any missing parameters."
          );
        } else {
          this.toast.success("TMT Report Parsed", "Please verify the extracted parameters below.");
        }
      },
      error: (err) => {
        this.tmtParsing.set(false);
        const msg = err.error?.message || "Failed to parse TMT PDF report.";
        this.tmtWarnings.set([msg]);
        this.toast.error("TMT Extraction Error", msg);
      },
    });
  }

  clearTmt(): void {
    this.tmtFile.set(null);
    this.tmtFileName.set("");
    this.tmtParsing.set(false);
    this.tmtWarnings.set([]);
    this.tmtExtracted.set(false);
    this.tmtStatus.set("");
    this.tmtFieldSources.set({});
    this.tmtIsMismatch.set(false);
    this.tmtMismatchMessage.set("");
    this.tmtExtractedSummary.set([]);
    this.tmtManualReviewSummary.set([]);
    this.tmtMissingSummary.set([]);
    this.tmtFieldPages.set({});
    this.tmtDtsReported.set(false);
    this.tmtReportedDts.set(null);
    this.tmtDocProcessing.set(null);
    this.tmtClinicalStatusText.set("");
    this.tmtForm.reset({
      protocol: "Standard Bruce",
      durationMinutes: null,
      durationFormatted: "",
      mets: null,
      restingHR: null,
      thalach: null,
      restingBP: "",
      peakBP: "",
      exang: null,
      oldpeak: null,
      slope: null,
      restecg: null,
      tmtResult: null,
      reportedConclusion: "",
    });
  }

  onDurationFormattedChange(event: Event): void {
    const input = (event.target as HTMLInputElement).value;
    this.markFieldEdited('tmt', 'durationFormatted');
    this.markFieldEdited('tmt', 'durationMinutes');
    if (!input || !input.trim()) {
      this.tmtForm.patchValue({ durationMinutes: null });
      return;
    }
    const trimmed = input.trim();
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':');
      const mins = parseFloat(parts[0]) || 0;
      const secs = parseFloat(parts[1]) || 0;
      const decimalMinutes = Math.round((mins + secs / 60) * 100) / 100;
      this.tmtForm.patchValue({ durationMinutes: decimalMinutes });
    } else {
      const val = parseFloat(trimmed);
      if (!isNaN(val)) {
        this.tmtForm.patchValue({ durationMinutes: val });
      }
    }
  }

  markFieldEdited(section: "ecg" | "tmt", field: string): void {
    if (section === "ecg") {
      this.ecgFieldSources.update((prev) => ({ ...prev, [field]: "manual" }));
    } else {
      this.tmtFieldSources.update((prev) => ({ ...prev, [field]: "manual" }));
    }
  }

  // ---------------------------------------------------------------------------
  // Prediction Submission
  // ---------------------------------------------------------------------------
  onSubmit(): void {
    if (this.form.invalid) {
      this.toast.error(
        "Incomplete form",
        "Please review all sections before predicting."
      );
      return;
    }

    const sysBP = this.form.controls.sysBP.value;
    const diaBP = this.form.controls.diaBP.value;

    if (diaBP >= sysBP) {
      this.toast.error(
        "Invalid blood pressure",
        "Diastolic BP must be lower than systolic BP."
      );
      return;
    }

    this.submitting.set(true);

    const raw = this.form.getRawValue();

    const input: PredictionInput = {
      male: raw.male as 0 | 1,
      age: raw.age,
      education: raw.education as 1 | 2 | 3 | 4,
      currentSmoker: raw.currentSmoker as 0 | 1,
      cigsPerDay: raw.cigsPerDay,
      BPMeds: raw.BPMeds as 0 | 1,
      prevalentStroke: raw.prevalentStroke as 0 | 1,
      prevalentHyp: raw.prevalentHyp as 0 | 1,
      diabetes: raw.diabetes as 0 | 1,
      totChol: raw.totChol,
      sysBP: raw.sysBP,
      diaBP: raw.diaBP,
      BMI: raw.BMI,
      heartRate: raw.heartRate,
      glucose: raw.glucose,
    };

    // Build optional investigations if populated
    let ecgPayload: EcgInput | null = null;
    if (this.hasEcgData()) {
      const ecgVal = this.ecgForm.value;
      ecgPayload = {
        heartRate: ecgVal.heartRate ?? null,
        prInterval: ecgVal.prInterval ?? null,
        qrsDuration: ecgVal.qrsDuration ?? null,
        qtInterval: ecgVal.qtInterval ?? null,
        qtcInterval: ecgVal.qtcInterval ?? null,
        stFindings: ecgVal.stFindings ?? null,
        tWaveFindings: ecgVal.tWaveFindings ?? null,
        rhythm: ecgVal.rhythm ?? null,
        interpretation: ecgVal.interpretation ?? null,
      };
    }

    let tmtPayload: TmtInput | null = null;
    if (this.hasTmtData()) {
      const tmtVal = this.tmtForm.value;
      tmtPayload = {
        age: raw.age,
        sex: raw.male as number,
        exang: tmtVal.exang ?? null,
        oldpeak: tmtVal.oldpeak ?? null,
        slope: tmtVal.slope ?? null,
        thalach: tmtVal.thalach ?? null,
        restingHR: tmtVal.restingHR ?? null,
        restecg: tmtVal.restecg != null ? tmtVal.restecg : null,
        mets: tmtVal.mets ?? null,
        durationMinutes: tmtVal.durationMinutes ?? null,
        protocol: tmtVal.protocol ?? "Standard Bruce",
        reportedConclusion: tmtVal.reportedConclusion ?? null,
      };
    }

    this.prediction
      .predict(input, ecgPayload, tmtPayload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: (result) => {
          this.toast.success(
            "Assessment complete",
            "Your cardiovascular risk profile has been generated."
          );
          this.router.navigate(["/app/result", result.id]);
        },
        error: (error) => {
          console.error("Prediction error:", error);
          this.toast.error(
            "Prediction failed",
            error.error?.message || "Unable to complete risk calculation."
          );
        },
      });
  }
}
