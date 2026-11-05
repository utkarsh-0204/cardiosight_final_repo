// =============================================================================
// Admin service – user management, platform stats, prediction monitoring,
// system health, activity feed, and audit logging.
// =============================================================================
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import type {
  AdminActivity,
  AdminStats,
  AdminUserRow,
  AdminUserDetails,
  AdminPredictionRow,
  SystemHealthReport,
  AdminAuditLog,
} from '../models/analytics.model';

export interface UserQueryParams {
  search?: string;
  type?: 'genuine' | 'test' | 'all';
  role?: 'patient' | 'admin' | 'all';
  status?: 'active' | 'inactive' | 'suspended' | 'all';
  sortBy?: 'createdAt' | 'lastActiveAt' | 'predictionsCount' | 'name';
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
  paginate?: boolean;
}

export interface PaginatedUsersResponse {
  users: AdminUserRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedPredictionsResponse {
  predictions: AdminPredictionRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly api = inject(ApiService);

  /** GET /api/admin/stats */
  getStats(): Observable<AdminStats> {
    return this.api.get<AdminStats>('/admin/stats');
  }

  /** GET /api/admin/users - Returns array or paginated payload depending on paginate flag */
  getUsers(params?: UserQueryParams): Observable<AdminUserRow[]> {
    const query: Record<string, string | number | boolean | undefined> = {
      search: params?.search || undefined,
      type: params?.type || undefined,
      role: params?.role || undefined,
      status: params?.status || undefined,
      sortBy: params?.sortBy || undefined,
      order: params?.order || undefined,
      page: params?.page,
      limit: params?.limit,
      paginate: params?.paginate,
    };
    return this.api.get<AdminUserRow[]>('/admin/users', query);
  }

  /** GET /api/admin/users/:id */
  getUserDetails(id: string): Observable<AdminUserDetails> {
    return this.api.get<AdminUserDetails>(`/admin/users/${id}`);
  }

  /** GET /api/admin/users/:id/predictions */
  getUserPredictions(id: string): Observable<{
    patient: { id: string; name: string; email: string; role: string };
    predictions: Array<{
      id: string;
      riskLevel: string;
      riskScore: number;
      probability: number;
      confidence: number;
      hasEcg: boolean;
      hasTmt: boolean;
      submittedAt: string;
    }>;
  }> {
    return this.api.get(`/admin/users/${id}/predictions`);
  }

  /** PATCH /api/admin/users/:id/status */
  updateUserStatus(id: string, status: 'active' | 'inactive' | 'suspended'): Observable<{ id: string; status: string }> {
    return this.api.patch<{ id: string; status: string }>(`/admin/users/${id}/status`, { status });
  }

  /** DELETE /api/admin/users/:id */
  deleteUser(id: string): Observable<{ message: string }> {
    return this.api.delete<{ message: string }>(`/admin/users/${id}`);
  }

  /** GET /api/admin/predictions */
  getPredictions(params?: { search?: string; riskLevel?: string; page?: number; limit?: number }): Observable<PaginatedPredictionsResponse> {
    const query: Record<string, string | number | boolean | undefined> = {
      search: params?.search,
      riskLevel: params?.riskLevel,
      page: params?.page,
      limit: params?.limit,
    };
    return this.api.get<PaginatedPredictionsResponse>('/admin/predictions', query);
  }

  /** GET /api/admin/activities */
  getActivities(): Observable<AdminActivity[]> {
    return this.api.get<AdminActivity[]>('/admin/activities');
  }

  /** GET /api/admin/health */
  getSystemHealth(): Observable<SystemHealthReport> {
    return this.api.get<SystemHealthReport>('/admin/health');
  }

  /** GET /api/admin/audit-logs */
  getAuditLogs(page = 1, limit = 20): Observable<{ logs: AdminAuditLog[]; total: number; page: number; limit: number; totalPages: number }> {
    return this.api.get('/admin/audit-logs', { page, limit });
  }
}
