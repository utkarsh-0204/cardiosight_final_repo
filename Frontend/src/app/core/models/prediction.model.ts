// =============================================================================
// Prediction domain models with optional ECG & TMT investigation support.
// =============================================================================

import type { RiskLevel } from "./common.model";

/** Raw Framingham inputs collected by the prediction form. */
export interface PredictionInput {
  // Personal
  male: 0 | 1;
  age: number;
  education: 1 | 2 | 3 | 4;

  // Lifestyle
  currentSmoker: 0 | 1;
  cigsPerDay: number;

  // Medical history
  BPMeds: 0 | 1;
  prevalentStroke: 0 | 1;
  prevalentHyp: 0 | 1;
  diabetes: 0 | 1;

  // Clinical
  totChol: number;
  sysBP: number;
  diaBP: number;
  BMI: number;
  heartRate: number;
  glucose: number;
}

export interface FactorContribution {
  factor: string;
  impact: number;
  severity: "low" | "medium" | "high";
  label: string;
  detail: string;
}

// ---------------------------------------------------------------------------
// Optional ECG Models
// ---------------------------------------------------------------------------

export interface EcgInput {
  heartRate?: number | null;
  prInterval?: number | null;
  qrsDuration?: number | null;
  qtInterval?: number | null;
  qtcInterval?: number | null;
  stFindings?: string | null;
  tWaveFindings?: string | null;
  rhythm?: string | null;
  interpretation?: string | null;
}

export interface ExtractedField<T = number | string | null> {
  value: T;
  unit?: string;
  status: "extracted" | "not_found" | "manual" | "uncertain";
  confidence?: number;
  rawText?: string;
}

export interface EcgExtractionResponse {
  success: boolean;
  documentType: "ECG";
  fileName: string;
  pageCount: number;
  extractionStatus: string;
  isScanned: boolean;
  fields: {
    heartRate: ExtractedField<number | null>;
    prInterval: ExtractedField<number | null>;
    qrsDuration: ExtractedField<number | null>;
    qtInterval: ExtractedField<number | null>;
    qtcInterval: ExtractedField<number | null>;
    stFindings: ExtractedField<string | null>;
    tWaveFindings: ExtractedField<string | null>;
    rhythm: ExtractedField<string | null>;
  };
  reportedDiagnosis?: string | null;
  warnings: string[];
  extractedAt: string;
}

export interface EcgFindings {
  status: "normal" | "borderline" | "abnormal" | "indeterminate" | "error";
  rhythm?: string;
  measurements: {
    heartRate?: number | null;
    prInterval?: number | null;
    qrsDuration?: number | null;
    qtInterval?: number | null;
    qtcInterval?: number | null;
    stFindings?: string | null;
    tWaveFindings?: string | null;
  };
  abnormalities: string[];
  ptbxlDiagnosticClass?: string;
  interpretationSummary: string;
  disclaimer: string;
  warnings?: string[];
}

// ---------------------------------------------------------------------------
// Optional TMT Models
// ---------------------------------------------------------------------------

export interface TmtInput {
  exang?: number | null; // 0 = No, 1 = Yes
  oldpeak?: number | null; // ST depression in mm
  slope?: number | null; // 1 = Upsloping, 2 = Flat, 3 = Downsloping
  thalach?: number | null; // Max HR achieved
  restingHR?: number | null;
  restecg?: number | null; // 0 = normal, 1 = ST-T wave abnormality, 2 = LVH
  mets?: number | null;
  durationMinutes?: number | null;
  protocol?: string | null;
  reportedConclusion?: string | null;
}

export interface TmtExtractionResponse {
  success: boolean;
  documentType: "TMT";
  fileName: string;
  pageCount: number;
  extractionStatus: string;
  isScanned: boolean;
  fields: {
    exang: ExtractedField<number | null>;
    oldpeak: ExtractedField<number | null>;
    slope: ExtractedField<number | null>;
    thalach: ExtractedField<number | null>;
    restingHR: ExtractedField<number | null>;
    restecg: ExtractedField<number | null>;
    mets: ExtractedField<number | null>;
    durationMinutes: ExtractedField<number | null>;
    protocol: ExtractedField<string | null>;
  };
  reportedConclusion?: string | null;
  warnings: string[];
  extractedAt: string;
}

export interface TmtFindings {
  status: "normal" | "inconclusive" | "ischemic_response" | "error";
  measurements: {
    exang?: number | null;
    oldpeak?: number | null;
    slope?: number | null;
    thalach?: number | null;
    restingHR?: number | null;
    restecg?: number | null;
    mets?: number | null;
    durationMinutes?: number | null;
  };
  targetHeartRate?: {
    agePredictedMaxHR: number;
    submaximalTargetHR: number;
    achievedPercentOfMax: number;
    targetAchieved: boolean;
  } | null;
  dukeTreadmillScore?: {
    score: number;
    riskCategory: "Low Risk" | "Moderate Risk" | "High Risk";
    estimatedAnnualMortality: string;
    note: string;
  } | null;
  mlUciStressModel?: {
    predictedClass: number;
    label: string;
    confidence: number;
    riskProbability: number;
    modelName: string;
  } | null;
  reportedConclusion?: string | null;
  warnings?: string[];
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Unified Prediction Result
// ---------------------------------------------------------------------------

export interface PredictionResult {
  id: string;
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: number;
  diseaseProbability: number;
  recommendations: string[];
  contributingFactors: FactorContribution[];
  input: PredictionInput & {
    ecg?: EcgFindings | null;
    tmt?: TmtFindings | null;
  };
  ecg?: EcgFindings | null;
  tmt?: TmtFindings | null;
  submittedAt: string;
}

export interface PredictionRecord {
  id: string;
  patientId: string;
  patientName: string;
  age: number;
  male: 0 | 1;
  riskScore: number;
  riskLevel: RiskLevel;
  confidence: number;
  submittedAt: string;
  status: "completed" | "processing" | "failed";
  input: PredictionInput;
}

// ---------------------------------------------------------------------------
// Explainable AI (XAI) Models via SHAP TreeExplainer
// ---------------------------------------------------------------------------

export interface FeatureContribution {
  feature: string;
  label: string;
  raw_value: number;
  formatted_value: string;
  unit: string;
  shap_value: number;
  contribution_pct: number;
  direction: "increased_risk" | "decreased_risk" | "neutral";
  direction_label: string;
  magnitude: number;
  clinical_insight: string;
}

export interface WaterfallStep {
  label: string;
  feature?: string;
  formatted_value?: string;
  shift: number;
  running_total: number;
  type: "baseline" | "increase" | "decrease" | "final";
  description: string;
}

export interface GlobalFeatureImportance {
  feature: string;
  label: string;
  importance: number;
}

export interface ExplanationResult {
  predictionId: string;
  submittedAt: string;
  model_type: string;
  explanation_method: string;
  time_horizon: string;
  predicted_probability: number;
  predicted_class: number;
  base_value: number;
  reconstructed_probability: number;
  mathematical_consistency: boolean;
  feature_contributions: FeatureContribution[];
  top_positive_factors: FeatureContribution[];
  top_negative_factors: FeatureContribution[];
  waterfall_steps: WaterfallStep[];
  global_feature_importance: GlobalFeatureImportance[];
  personalized_explanation: string;
  disclaimer: string;
}

