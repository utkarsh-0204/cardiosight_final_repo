import type {
  PredictionInput,
  PredictionRecord,
  PredictionResult,
  FactorContribution,
} from "../models/prediction.model";

import type { RiskLevel } from "../models/common.model";
import type { User } from '../models/user.model';
import type { HealthMetric, HealthTip, AppNotification } from '../models/health.model';

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

function calculateMockRisk(input: PredictionInput): number {
  let score = 10;

  // Age
  score += Math.max(0, input.age - 40) * 0.8;

  // Male
  if (input.male === 1) {
    score += 4;
  }

  // Smoking
  if (input.currentSmoker === 1) {
    score += 12;
  }

  score += Math.min(input.cigsPerDay * 0.15, 6);

  // Medical history
  if (input.BPMeds === 1) {
    score += 4;
  }

  if (input.prevalentStroke === 1) {
    score += 12;
  }

  if (input.prevalentHyp === 1) {
    score += 8;
  }

  if (input.diabetes === 1) {
    score += 8;
  }

  // Clinical values
  if (input.totChol > 200) {
    score += (input.totChol - 200) * 0.08;
  }

  if (input.sysBP > 120) {
    score += (input.sysBP - 120) * 0.12;
  }

  if (input.BMI > 25) {
    score += (input.BMI - 25) * 0.7;
  }

  if (input.glucose > 100) {
    score += (input.glucose - 100) * 0.04;
  }

  if (input.heartRate > 80) {
    score += (input.heartRate - 80) * 0.05;
  }

  return Math.round(clamp(score, 2, 97));
}

function getRiskLevel(score: number): RiskLevel {
  if (score >= 20) return "high";
  if (score >= 10) return "medium";
  return "low";
}

function buildFactors(input: PredictionInput): FactorContribution[] {
  const factors: FactorContribution[] = [];

  if (input.age > 40) {
    factors.push({
      factor: "age",
      impact: clamp((input.age - 40) / 40, 0, 1),
      severity: input.age > 60 ? "high" : "medium",
      label: "Age",
      detail: `${input.age} years`,
    });
  }

  if (input.currentSmoker === 1) {
    factors.push({
      factor: "smoking",
      impact: 0.9,
      severity: "high",
      label: "Smoking",
      detail: `${input.cigsPerDay} cigarettes/day`,
    });
  }

  if (input.prevalentHyp === 1 || input.sysBP > 120) {
    factors.push({
      factor: "blood-pressure",
      impact: clamp((input.sysBP - 120) / 80, 0, 1),
      severity: input.sysBP > 140 ? "high" : "medium",
      label: "Systolic blood pressure",
      detail: `${input.sysBP} mmHg`,
    });
  }

  if (input.totChol > 200) {
    factors.push({
      factor: "cholesterol",
      impact: clamp((input.totChol - 200) / 150, 0, 1),
      severity: input.totChol > 240 ? "high" : "medium",
      label: "Total cholesterol",
      detail: `${input.totChol} mg/dL`,
    });
  }

  if (input.BMI > 25) {
    factors.push({
      factor: "bmi",
      impact: clamp((input.BMI - 25) / 15, 0, 1),
      severity: input.BMI > 30 ? "high" : "medium",
      label: "BMI",
      detail: input.BMI.toFixed(1),
    });
  }

  if (input.diabetes === 1) {
    factors.push({
      factor: "diabetes",
      impact: 0.8,
      severity: "high",
      label: "Diabetes",
      detail: "Diabetes is present",
    });
  }

  if (input.prevalentStroke === 1) {
    factors.push({
      factor: "stroke",
      impact: 0.9,
      severity: "high",
      label: "Previous stroke",
      detail: "Previous stroke is present",
    });
  }

  return factors.slice(0, 6);
}

function buildRecommendations(input: PredictionInput): string[] {
  const recommendations: string[] = [];

  if (input.currentSmoker === 1) {
    recommendations.push("Consider a structured smoking-cessation program.");
  }

  if (input.sysBP > 130) {
    recommendations.push(
      "Monitor your blood pressure regularly and discuss elevated readings with a healthcare professional."
    );
  }

  if (input.totChol > 200) {
    recommendations.push(
      "Discuss your cholesterol levels with a healthcare professional and follow a heart-healthy diet."
    );
  }

  if (input.BMI > 25) {
    recommendations.push(
      "Maintain a healthy weight through regular physical activity and a balanced diet."
    );
  }

  if (input.diabetes === 1) {
    recommendations.push(
      "Keep blood glucose under appropriate medical supervision."
    );
  }

  if (input.prevalentStroke === 1) {
    recommendations.push(
      "Discuss your cardiovascular risk with a healthcare professional."
    );
  }

  recommendations.push(
    "Aim for regular physical activity and a heart-healthy lifestyle."
  );

  recommendations.push(
    "Use this result as a screening estimate, not as a medical diagnosis."
  );

  return [...new Set(recommendations)].slice(0, 6);
}

export function mockPredictionResult(input: PredictionInput): PredictionResult {
  const riskScore = calculateMockRisk(input);
  const riskLevel = getRiskLevel(riskScore);

  return {
    id: `pred_${Date.now()}`,
    riskScore,
    riskLevel,
    confidence: 88,
    diseaseProbability: clamp(riskScore + 3, 3, 99),
    recommendations: buildRecommendations(input),
    contributingFactors: buildFactors(input),
    input,
    submittedAt: new Date().toISOString(),
  };
}

export const MOCK_PREDICTIONS: PredictionRecord[] = [];

export const MOCK_USER: User = {
  id: "usr_001",
  firstName: "Aarav",
  lastName: "Sharma",
  email: "aarav@example.com",
  phone: "+91 9876543210",
  role: "patient" as const,
  avatarColor: "#1976D2",
  gender: "male" as const,
  dateOfBirth: "1995-01-15",
  heightCm: 175,
  weightKg: 72,
  bloodGroup: "O+",
  allergies: [],
  medications: [],
  medicalConditions: [],
  isEmailVerified: true,
  createdAt: new Date().toISOString(),
};

export const MOCK_ADMIN: User = {
  id: "admin_001",
  firstName: "Admin",
  lastName: "User",
  email: "admin@example.com",
  phone: "+91 9876543211",
  role: "admin" as const,
  avatarColor: "#7B1FA2",
  gender: "other" as const,
  dateOfBirth: "1990-01-01",
  heightCm: 170,
  weightKg: 68,
  bloodGroup: "A+",
  allergies: [],
  medications: [],
  medicalConditions: [],
  isEmailVerified: true,
  createdAt: new Date().toISOString(),
};

export const MOCK_USERS = [MOCK_USER, MOCK_ADMIN];

export const MOCK_ACTIVITIES = [];

export const MOCK_ADMIN_ACTIVITIES = [];

export const MOCK_DASHBOARD_METRICS: HealthMetric[] = [
  { key: "totalPredictions", label: "Total Predictions", value: 0, unit: "", goodRange: [0, 999], status: "good" },
  { key: "highRisk", label: "High Risk", value: 0, unit: "", goodRange: [0, 0], status: "good" },
  { key: "mediumRisk", label: "Medium Risk", value: 0, unit: "", goodRange: [0, 0], status: "good" },
  { key: "lowRisk", label: "Low Risk", value: 0, unit: "", goodRange: [0, 999], status: "good" },
];

export const MOCK_HEALTH_TIPS: HealthTip[] = [
  { id: "tip_1", title: "Stay Active", body: "Stay physically active regularly.", icon: "directions_run", tag: "Activity" },
  { id: "tip_2", title: "Eat Well", body: "Maintain a balanced, heart-healthy diet.", icon: "restaurant", tag: "Nutrition" },
  { id: "tip_3", title: "Monitor BP", body: "Monitor your blood pressure regularly.", icon: "favorite", tag: "Heart Health" },
];

export const MOCK_NOTIFICATIONS: AppNotification[] = [];
