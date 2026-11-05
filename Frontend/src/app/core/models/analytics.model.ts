// =============================================================================
// Analytics & admin models.
// =============================================================================
import type { User } from './user.model';
import type { PredictionRecord } from './prediction.model';

export interface RiskDistributionSlice {
  label: string;
  value: number;
  color: string;
}

export interface GenderDistributionSlice {
  label: string;
  value: number;
}

export interface AgeDistributionSlice {
  range: string;
  total: number;
  highRisk: number;
}

export interface MonthlyPredictionsPoint {
  month: string;
  predictions: number;
  highRisk: number;
}

export interface AnalyticsSummary {
  totalPredictions: number;
  totalUsers: number;
  avgRiskScore: number;
  highRiskRate: number; // percentage
  riskDistribution: RiskDistributionSlice[];
  genderDistribution: GenderDistributionSlice[];
  ageDistribution: AgeDistributionSlice[];
  monthlyPredictions: MonthlyPredictionsPoint[];
}

export interface AdminStats {
  totalUsers: number;
  totalPatients?: number;
  patients: number;
  admins: number;
  totalAdmins?: number;
  testAccounts?: number;
  totalPredictions: number;
  predictionsThisWeek: number;
  highRiskPredictions: number;
  highRiskRate?: number;
  avgRiskScore: number;
  newUsersThisMonth: number;
  newPatientsThisMonth?: number;
  riskDistribution?: RiskDistributionSlice[];
  genderDistribution?: GenderDistributionSlice[];
  ageDistribution?: AgeDistributionSlice[];
  monthlyPredictions?: MonthlyPredictionsPoint[];
}

export interface AdminUserRow extends User {
  predictionsCount: number;
  lastActiveAt: string;
  status: 'active' | 'inactive' | 'suspended';
  rawStatus?: string;
  isTest?: boolean;
  accountType?: 'genuine' | 'admin' | 'test';
}

export interface AdminUserDetails extends AdminUserRow {
  stats: {
    predictionsCount: number;
    avgRiskScore: number;
    lastPredictionAt: string | null;
    latestAssessment: {
      id: string;
      risk_level: string;
      risk_score: number;
      probability: number;
      created_at: string;
    } | null;
  };
}

export interface AdminPredictionRow {
  id: string;
  patientId: string;
  patientName: string;
  patientEmail: string;
  isTestPatient: boolean;
  riskLevel: string;
  riskScore: number;
  probability: number;
  confidence: number;
  hasEcg: boolean;
  hasTmt: boolean;
  submittedAt: string;
}

export interface AdminActivity {
  id: string;
  user: string;
  role: string;
  action: string;
  target: string;
  icon: string;
  createdAt: string;
}

export interface RecentPredictionRow extends PredictionRecord {
  patientId: string;
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'unhealthy' | 'operational' | 'degraded';
  latencyMs?: number;
  error?: string | null;
  details?: Record<string, unknown>;
  uptimeSeconds?: number;
  memoryMb?: number;
  nodeVersion?: string;
  environment?: string;
}

export interface SystemHealthReport {
  overallStatus: 'operational' | 'degraded';
  timestamp: string;
  services: {
    database: ServiceHealth;
    mlMicroservice: ServiceHealth;
    gateway: ServiceHealth;
  };
}

export interface AdminAuditLog {
  id: string;
  adminEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  details: Record<string, unknown>;
  timestamp: string;
}
