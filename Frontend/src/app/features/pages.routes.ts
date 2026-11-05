// =============================================================================
// Routes nested inside the authenticated application shell.
// =============================================================================
import { Routes } from '@angular/router';
import { adminGuard } from '../core/guards/admin.guard';
import { patientOnlyGuard } from '../core/guards/patient.guard';

export const appRoutes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'predict',
    canActivate: [patientOnlyGuard],
    loadComponent: () => import('./prediction/prediction-form.component').then((m) => m.PredictionFormComponent),
  },
  {
    path: 'result/:id',
    loadComponent: () => import('./prediction-result/prediction-result.component').then((m) => m.PredictionResultComponent),
  },
  {
    path: 'history',
    loadComponent: () => import('./history/history.component').then((m) => m.HistoryComponent),
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.component').then((m) => m.ProfileComponent),
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./admin/admin-dashboard.component').then((m) => m.AdminDashboardComponent),
      },
      {
        path: 'users',
        loadComponent: () => import('./admin/admin-users.component').then((m) => m.AdminUsersComponent),
      },
      {
        path: 'predictions',
        loadComponent: () => import('./admin/admin-predictions.component').then((m) => m.AdminPredictionsComponent),
      },
      {
        path: 'health',
        loadComponent: () => import('./admin/admin-health.component').then((m) => m.AdminHealthComponent),
      },
    ],
  },
  {
    path: 'analytics',
    canActivate: [adminGuard],
    loadComponent: () => import('./analytics/analytics.component').then((m) => m.AnalyticsComponent),
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.component').then((m) => m.AboutComponent),
  },
];
