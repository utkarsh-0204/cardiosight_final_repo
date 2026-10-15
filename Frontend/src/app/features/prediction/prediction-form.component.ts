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
  readonly ecgFile = signal<File | null>(null);
  readonly ecgFileName = signal<string>("");
  readonly ecgParsing = signal<boolean>(false);
  readonly ecgWarnings = signal<string[]>([]);
  readonly ecgStatus = signal<string>("");
  readonly ecgExtracted = signal<boolean>(false);
  readonly ecgFieldSources = signal<Record<string, string>>({});

  readonly ecgForm = this.fb.group({
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

  readonly tmtForm = this.fb.group({
    exang: [null as number | null], // 0 = No, 1 = Yes
    oldpeak: [null as number | null, [Validators.min(0), Validators.max(10)]],
    slope: [null as number | null], // 1 = Upsloping, 2 = Flat, 3 = Downsloping
    thalach: [null as number | null, [Validators.min(50), Validators.max(240)]],
    restingHR: [null as number | null, [Validators.min(40), Validators.max(200)]],
    restecg: [null as number | null], // 0 = Normal, 1 = ST-T wave abnormality, 2 = LVH
    mets: [null as number | null, [Validators.min(1), Validators.max(30)]],
    durationMinutes: [null as number | null, [Validators.min(0.5), Validators.max(45)]],
    protocol: ["Standard Bruce"],
    reportedConclusion: [""],
  });

  readonly progress = computed(() =>
    Math.round(((this.currentStep() - 1) / (STEPS.length - 1)) * 100)
  );

  readonly isFirstStep = computed(() => this.currentStep() === 1);
  readonly isLastStep = computed(() => this.currentStep() === STEPS.length);

  readonly hasEcgData = computed(() => {
    const val = this.ecgForm.value;
    return Boolean(
      val.heartRate ||
      val.prInterval ||
      val.qrsDuration ||
      val.qtInterval ||
      val.qtcInterval ||
      val.stFindings ||
      val.tWaveFindings ||
      val.rhythm ||
      (val.interpretation && val.interpretation.trim().length > 0)
    );
  });

  readonly hasTmtData = computed(() => {
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

        const sources: Record<string, string> = {};
        let extractedFieldCount = 0;
        if (res.fields) {
          if (res.fields.heartRate?.value != null) {
            this.ecgForm.patchValue({ heartRate: res.fields.heartRate.value });
            sources["heartRate"] = res.fields.heartRate.status;
            extractedFieldCount++;
          }
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
          if (res.fields.rhythm?.value != null) {
            this.ecgForm.patchValue({ rhythm: res.fields.rhythm.value });
            sources["rhythm"] = res.fields.rhythm.status;
            extractedFieldCount++;
          }
        }
        if (res.reportedDiagnosis) {
          this.ecgForm.patchValue({ interpretation: res.reportedDiagnosis });
          sources["interpretation"] = "extracted";
          extractedFieldCount++;
        }
        this.ecgFieldSources.set(sources);

        if (res.extractionStatus === "empty" || extractedFieldCount === 0) {
          this.toast.warning(
            "No Measurements Extracted",
            res.warnings?.[0] || "The document contains no readable ECG measurements. Please enter values manually."
          );
        } else if (res.extractionStatus === "partial" || extractedFieldCount < 3) {
          this.toast.info(
            "Partial ECG Extracted",
            "Some ECG values were extracted. Please review and enter any missing parameters."
          );
        } else {
          this.toast.success("ECG Report Parsed", "Please verify the extracted parameters below.");
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
    this.ecgForm.reset({
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

    this.prediction.parseTmt(file).subscribe({
      next: (res) => {
        this.tmtParsing.set(false);
        this.tmtExtracted.set(true);
        this.tmtStatus.set(res.extractionStatus);
        this.tmtWarnings.set(res.warnings || []);

        const sources: Record<string, string> = {};
        let extractedFieldCount = 0;
        if (res.fields) {
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
          if (res.fields.protocol?.value != null) {
            this.tmtForm.patchValue({ protocol: res.fields.protocol.value });
            sources["protocol"] = res.fields.protocol.status;
            extractedFieldCount++;
          }
        }
        if (res.reportedConclusion) {
          this.tmtForm.patchValue({ reportedConclusion: res.reportedConclusion });
          sources["reportedConclusion"] = "extracted";
          extractedFieldCount++;
        }
        this.tmtFieldSources.set(sources);

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
    this.tmtForm.reset({
      exang: null,
      oldpeak: null,
      slope: null,
      thalach: null,
      restingHR: null,
      restecg: null,
      mets: null,
      durationMinutes: null,
      protocol: "Standard Bruce",
      reportedConclusion: "",
    });
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
