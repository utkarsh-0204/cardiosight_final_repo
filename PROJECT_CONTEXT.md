# CardioSight (CardioSight_FIXED) - Project Context & Technical Reference

This document serves as the verified technical specification and reference manual for the CardioSight codebase. All details have been verified directly against active source files.

---

## 1. Project Purpose & Features

**CardioSight** is a clinical machine learning web platform for estimating **10-year risk of Coronary Heart Disease (CHD)** based on the landmark **Framingham Heart Study** dataset. It provides an interactive clinical workflow for patients and healthcare administrators.

### Core Features
- **Multi-Step Framingham Clinical Risk Intake:** 5-step form collecting 15 clinical, lifestyle, and demographic parameters with client-side numeric validation and blood pressure consistency checks.
- **Real-Time ML Risk Assessment:** Machine learning inference returning 10-year CHD risk category (`low`, `medium`, `high`), probability percentage, and risk score.
- **Risk Driver & Clinical Recommendation Engine:** Evaluates biomarkers (systolic BP, total cholesterol, BMI, glucose, smoking, age) to identify high/medium severity contributors and provide tailored lifestyle and dietary advice.
- **Interactive Patient Dashboard:** Visualizes overall health score (inverse of risk), vitals trackers (blood pressure, resting heart rate, total cholesterol, fasting glucose), activity timelines, and health tips.
- **Searchable Prediction History:** Paginated, sortable, and filterable history of past assessments with JSON report export.
- **Population Analytics:** Platform-wide risk distributions, demographic breakdowns, age-bucket groupings, and monthly prediction trends.
- **Role-Based Administration:** Separate `patient` and `admin` roles. Admin console displays platform-wide KPIs, user management (search and deletion), and audit feeds.
- **Profile & Medical Data Management:** User vitals, blood group, allergies, active medications, chronic conditions, and password update functionality.
- **JWT Authentication & OTP Verification:** Bearer token authentication, bcrypt password hashing, and SHA-256 hashed 6-digit verification codes.

---

## 2. Verified Technology Stack

| Layer | Technology | Version / Specifics | Verification Source |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | Angular | `20.3.27` (Standalone Components, Signals, Router View Transitions) | `Frontend/package.json` |
| **Frontend UI Components** | Angular Material & CDK | `20.2.14` | `Frontend/package.json` |
| **State & Reactivity** | Angular Signals + RxJS | `rxjs: ~7.8.1`, Native Angular Signal primitives | `Frontend/src/app/core/services/auth.service.ts` |
| **Charting Engine** | Chart.js | `^4.4.7` | `Frontend/package.json` |
| **Language & Styling** | TypeScript & SCSS | `TypeScript: ~5.8.2`, Custom CSS Variables & SCSS tokens | `Frontend/src/styles.scss` |
| **Backend Runtime & Gateway**| Node.js + Express.js | `express: ^4.21.2` (CommonJS module system) | `Backend/package.json` |
| **Backend Auth & Crypto** | JSON Web Tokens & bcrypt | `jsonwebtoken: ^9.0.2`, `bcrypt: ^5.1.1` | `Backend/package.json` |
| **Database Client** | node-postgres (`pg`) | `^8.13.1` (Connection Pooling) | `Backend/config/db.js` |
| **Internal HTTP Client** | Axios | `^1.7.9` (Express to Django ML communication) | `Backend/services/mlService.js` |
| **Database** | PostgreSQL | Relational DB with `pgcrypto` extension for UUIDs | `Backend/config/schema.sql` |
| **ML Framework & Service** | Django | `5.2.18` (Headless API microservice on port 8000) | `ML/requirements.txt`, `ML/cardiosight_ml/settings.py` |
| **ML Libraries** | Scikit-learn, Pandas, NumPy, Joblib | `scikit-learn >= 1.5`, `pandas >= 2.1`, `numpy >= 1.26`, `joblib >= 1.3` | `ML/requirements.txt` |
| **ML Model Pipeline** | Scikit-learn Pipeline | `SimpleImputer(median)` + `RandomForestClassifier(class_weight="balanced")` | `ML/mlapp/train_framingham.py` |

---

## 3. Directory Structure & Important Files

```text
CardioSight_FIXED/
├── README.md                      # Setup and operational instructions
├── train_framingham.py            # Standalone root training script (LogisticRegression pipeline)
├── Backend/                       # Node.js + Express REST API Gateway
│   ├── .env                       # Environment variables (PORT, DB, JWT, ML URL, CORS)
│   ├── package.json               # Backend dependencies & npm scripts (start, dev, db:init, db:seed)
│   ├── server.js                  # Gateway entry point, middleware, routes, healthcheck
│   ├── config/
│   │   ├── db.js                  # PostgreSQL connection pool (pg.Pool)
│   │   ├── schema.sql             # Idempotent DDL (users, patients, predictions, verification_codes)
│   │   ├── initDb.js              # Schema application script (npm run db:init)
│   │   └── seed.js                # Default admin account seeder (npm run db:seed)
│   ├── controllers/
│   │   ├── authController.js      # Register, login, me, password reset, email verification
│   │   ├── userController.js      # Profile viewing, profile updating, password change
│   │   ├── predictionController.js# Framingham validation, ML dispatch, prediction/history CRUD
│   │   ├── dashboardController.js # Summary, vitals extraction, notifications, health tips
│   │   ├── analyticsController.js # Platform risk, demographic, and monthly stats
│   │   └── adminController.js     # Admin platform KPIs, user management, audit feeds
│   ├── middleware/
│   │   ├── auth.js                # JWT Bearer token authentication (attaches req.user)
│   │   ├── role.js                # Role guard (requireRole('admin'))
│   │   └── errorHandler.js        # asyncHandler, HttpError, 404 and central 500 handler
│   ├── routes/
│   │   ├── authRoutes.js          # /api/auth/* routes
│   │   ├── userRoutes.js          # /api/profile/* routes
│   │   ├── predictionRoutes.js    # /api/predict and /api/history/* routes
│   │   ├── dashboardRoutes.js     # /api/dashboard/* and /api/analytics routes
│   │   └── adminRoutes.js         # /api/admin/* routes
│   └── services/
│       └── mlService.js           # Axios client to Django ML, factor severity & advice generation
├── Frontend/                      # Angular 20 Single Page Application
│   ├── package.json               # Dependencies and scripts (ng serve --port 4200, build, test)
│   ├── angular.json               # Angular CLI workspace configuration
│   ├── tsconfig.json              # TypeScript configuration
│   └── src/
│       ├── main.ts                # Angular bootstrapApplication entry point
│       ├── styles.scss            # Global SCSS tokens, themes, typography, and utility classes
│       ├── environments/
│       │   ├── environment.ts     # Dev config (apiUrl: http://localhost:3000/api, useMock: false)
│       │   └── environment.prod.ts# Prod config
│       └── app/
│           ├── app.routes.ts      # Top-level routing: /landing, /auth, /app (guarded), 404
│           ├── app.config.ts      # Providers: Router, HttpClient with interceptors, Animations
│           ├── core/
│           │   ├── guards/        # authGuard, adminGuard, guestGuard
│           │   ├── interceptors/  # authInterceptor (Bearer JWT), errorInterceptor (toast alerts)
│           │   ├── models/        # TypeScript interfaces: prediction, user, auth, health, analytics
│           │   ├── services/      # ApiService, AuthService, PredictionService, HistoryService, etc.
│           │   └── components/    # AppShellComponent, SidebarComponent, TopbarComponent, etc.
│           ├── features/
│           │   ├── landing/       # Marketing landing page
│           │   ├── auth/          # Login, Register, Forgot Password, Verify Email
│           │   ├── dashboard/     # Patient summary dashboard, vitals, activity feed
│           │   ├── prediction/    # 5-step Framingham clinical intake form
│           │   ├── prediction-result/ # Risk meter gauge, disease probability, factor bars
│           │   ├── history/       # Searchable, filterable prediction history table
│           │   ├── profile/       # User profile details, clinical data, password change
│           │   ├── analytics/     # Platform population charts
│           │   ├── admin/         # Admin dashboard and user management tables
│           │   └── about/         # Informational health content
│           └── shared/            # Reusable UI components: risk-meter, circular-progress, stat-card
└── ML/                            # Django ML Service & Model Pipeline
    ├── manage.py                  # Django CLI runner
    ├── requirements.txt           # Python package specifications
    ├── framingham.csv             # Framingham Heart Study dataset (4,240 rows, 16 columns)
    ├── check_threshold.py         # Classification threshold optimizer script
    ├── cardiosight_ml/
    │   ├── settings.py            # Minimal headless Django settings
    │   ├── urls.py                # Mounts mlapp.urls at /api/
    │   ├── wsgi.py / asgi.py      # WSGI / ASGI entry points
    └── mlapp/
        ├── urls.py                # Defines /api/health and /api/predict
        ├── views.py               # Handlers: health check and predict
        ├── preprocess.py          # Validates 15 Framingham keys, builds DataFrame
        ├── model_store.py         # Thread-safe joblib model loader with caching
        ├── train_framingham.py    # Active training script (RandomForestClassifier on framingham.csv)
        ├── train.py               # (Legacy/Synthetic) Random Forest Regressor experiment
        ├── risk_lib.py            # (Legacy/Synthetic) Rule-based heuristic scoring library
        └── model_artifacts/
            └── model.joblib       # Active Scikit-learn Pipeline artifact (8.4 MB)
```

---

## 4. Frontend Architecture

- **Component Architecture:** Standalone components throughout (`standalone: true`). Feature routes are lazy-loaded via `loadComponent` or `loadChildren`.
- **Layout Structure:**
  - Public routes (`/landing`, `/auth/*`) render outside the shell.
  - Authenticated routes (`/app/*`) are nested under `AppShellComponent` containing `SidebarComponent`, `TopbarComponent`, `BreadcrumbsComponent`, and floating action button (FAB).
- **State Management:** Angular Signals (`signal`, `computed`) managed inside singleton root services (`providedIn: 'root'`).
- **HTTP Layer:**
  - `ApiService` is a thin typed wrapper over `HttpClient` pointing to `environment.apiUrl` (`http://localhost:3000/api`).
  - Response unwrapping: Automatically checks for backend envelope `{ success: true, data: T, message?: string }` and unwraps `data`.
  - `authInterceptor`: Automatically injects `Authorization: Bearer <accessToken>` on all requests except `/auth/login` and `/auth/register`.
  - `errorInterceptor`: Normalizes HTTP errors and triggers `ToastService.error`.
- **Navigation Guards:**
  - `authGuard`: Protects `/app/*` routes; redirects unauthenticated users to `/auth/login` with `returnUrl`.
  - `adminGuard`: Protects `/app/admin/*` routes; enforces `auth.isAdmin() === true`.
  - `guestGuard`: Prevents authenticated users from accessing `/auth/*` pages; redirects to `/app/dashboard`.
- **Mock Fallback Mode:** Services include an `environment.useMock` switch that returns in-memory mock data with simulated delay if enabled (default is `false`).

---

## 5. Backend Architecture

- **Pattern:** Express REST API Gateway acting as reverse orchestrator between the Angular client, PostgreSQL database, and Django ML engine.
- **Middleware Chain:**
  1. `express.json()` payload parsing.
  2. `cors()` configured with `process.env.CORS_ORIGINS` (default: `http://localhost:4200`), with `credentials: true`.
  3. Route modules mounted at `/api/auth`, `/api` (user, prediction, dashboard, admin).
  4. `notFound` 404 handler.
  5. `errorHandler` centralized error handler capturing `HttpError` instances.
- **Authentication & Authorization:**
  - Token-based via `jsonwebtoken`. Payload stores `sub` (user UUID) and `role` (`patient` | `admin`).
  - `authenticate` middleware decodes Bearer token, queries `users` table, and attaches the sanitized user object to `req.user`.
  - `requireRole('admin')` validates `req.user.role === 'admin'` returning HTTP 403 on violation.
- **Error Handling:** All controller handlers are wrapped in `asyncHandler` to safely forward errors to `errorHandler`.

---

## 6. Database Schema & Integration

PostgreSQL is accessed via `node-postgres` (`pg.Pool`) in `Backend/config/db.js`. Connection pooling supports either `DATABASE_URL` or individual `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` environment variables.

### Table Definitions (`Backend/config/schema.sql`)
1. **`users`**
   - `id`: UUID (Primary Key, default `gen_random_uuid()`)
   - `first_name`: VARCHAR(100) NOT NULL
   - `last_name`: VARCHAR(100) NOT NULL
   - `email`: VARCHAR(255) NOT NULL UNIQUE
   - `password_hash`: TEXT NOT NULL
   - `phone`: VARCHAR(50) NOT NULL DEFAULT ''
   - `role`: VARCHAR(20) NOT NULL DEFAULT 'patient' (CHECK `role IN ('patient', 'admin')`)
   - `avatar_color`: VARCHAR(20) NOT NULL DEFAULT '#43A047'
   - `gender`: VARCHAR(10) NOT NULL DEFAULT 'other' (CHECK `gender IN ('male', 'female', 'other')`)
   - `date_of_birth`: DATE
   - `height_cm`: NUMERIC(5,1)
   - `weight_kg`: NUMERIC(5,1)
   - `blood_group`: VARCHAR(5)
   - `allergies`: JSONB NOT NULL DEFAULT '[]'
   - `medications`: JSONB NOT NULL DEFAULT '[]'
   - `medical_conditions`: JSONB NOT NULL DEFAULT '[]'
   - `is_email_verified`: BOOLEAN NOT NULL DEFAULT FALSE
   - `created_at`: TIMESTAMPTZ NOT NULL DEFAULT now()

2. **`patients`**
   - `id`: UUID (Primary Key, default `gen_random_uuid()`)
   - `user_id`: UUID NOT NULL UNIQUE REFERENCES `users(id)` ON DELETE CASCADE
   - `created_at`: TIMESTAMPTZ NOT NULL DEFAULT now()

3. **`predictions`**
   - `id`: UUID (Primary Key, default `gen_random_uuid()`)
   - `user_id`: UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
   - `patient_id`: UUID REFERENCES `patients(id)` ON DELETE SET NULL
   - `prediction`: VARCHAR(50)
   - `risk_level`: VARCHAR(10) NOT NULL (CHECK `risk_level IN ('low', 'medium', 'high')`)
   - `risk_score`: NUMERIC(5,1)
   - `confidence`: NUMERIC(5,1)
   - `probability`: NUMERIC(5,1)
   - `status`: VARCHAR(20) NOT NULL DEFAULT 'completed' (CHECK `status IN ('completed', 'processing', 'failed')`)
   - `input`: JSONB NOT NULL DEFAULT '{}'
   - `recommendations`: JSONB NOT NULL DEFAULT '[]'
   - `contributing_factors`: JSONB NOT NULL DEFAULT '[]'
   - `created_at`: TIMESTAMPTZ NOT NULL DEFAULT now()
   - *Indexes:* `idx_predictions_user_id` on `user_id`, `idx_predictions_created_at` on `created_at DESC`

4. **`verification_codes`**
   - `id`: UUID (Primary Key, default `gen_random_uuid()`)
   - `user_id`: UUID NOT NULL REFERENCES `users(id)` ON DELETE CASCADE
   - `purpose`: VARCHAR(20) NOT NULL (CHECK `purpose IN ('email_verify', 'password_reset')`)
   - `code_hash`: TEXT NOT NULL (SHA-256)
   - `expires_at`: TIMESTAMPTZ NOT NULL
   - `used`: BOOLEAN NOT NULL DEFAULT FALSE
   - `created_at`: TIMESTAMPTZ NOT NULL DEFAULT now()
   - *Index:* `idx_verification_codes_user` on `user_id`

---

## 7. Machine Learning Pipeline & Model Details

- **Dataset:** Framingham Heart Study (`ML/framingham.csv`, 4,240 rows, 16 columns).
- **Target Variable:** `TenYearCHD` (binary: 0 = no CHD within 10 years, 1 = CHD diagnosed).
- **Feature Set (15 Variables):**
  1. `male`: 0 = female, 1 = male
  2. `age`: age in years (18–100)
  3. `education`: educational attainment (1–4)
  4. `currentSmoker`: 0 = non-smoker, 1 = current smoker
  5. `cigsPerDay`: cigarettes per day (0–100)
  6. `BPMeds`: blood pressure medication (0|1)
  7. `prevalentStroke`: history of stroke (0|1)
  8. `prevalentHyp`: history of hypertension (0|1)
  9. `diabetes`: diagnosed diabetes (0|1)
  10. `totChol`: total cholesterol in mg/dL (80–400)
  11. `sysBP`: systolic blood pressure in mmHg (70–260)
  12. `diaBP`: diastolic blood pressure in mmHg (40–160)
  13. `BMI`: body mass index (10–70)
  14. `heartRate`: resting heart rate in bpm (35–220)
  15. `glucose`: fasting glucose in mg/dL (40–400)
- **Model Pipeline Architecture:**
  - `SimpleImputer(strategy="median")`
  - `RandomForestClassifier(class_weight="balanced", random_state=42)`
- **Artifact:** Saved at `ML/mlapp/model_artifacts/model.joblib` via `joblib.dump({"model": pipeline, "feature_names": [...]})`.
- **Live Inference Execution:**
  - Endpoint: `POST /api/predict` on Django ML service.
  - Features DataFrame is re-ordered to match `artifact["feature_names"]`.
  - Predictions: `model.predict(X)[0]` (class 0/1) and `model.predict_proba(X)[0][1]` (continuous probability).

### Optional TMT Exercise Stress ML Pipeline (UCI Heart Disease)
- **Dataset:** Genuine UCI Heart Disease Cleveland Clinical Dataset (`ML/data/processed.cleveland.data`, 303 patient records, 14 clinical features).
- **Target Variable:** Angiographic coronary artery disease / inducible myocardial ischemia (`num` >= 1; >=50% diameter narrowing).
- **Features Used:** `age`, `sex`, `restecg`, `thalach` (max heart rate), `exang` (exercise-induced angina), `oldpeak` (ST depression), `slope` (peak exercise ST segment slope).
- **Preprocessing & Architecture:** `SimpleImputer(strategy="median")` + `StandardScaler()` + `RandomForestClassifier(n_estimators=100, max_depth=4, random_state=42)`.
- **Held-Out Test Split Evaluation (n=61):**
  - **ROC-AUC:** `0.9545`
  - **Accuracy:** `83.61%`
  - **Sensitivity:** `92.86%`
  - **Specificity:** `75.76%`
- **Artifact:** Saved at `ML/mlapp/model_artifacts/tmt_uci_model.joblib`.
- **Live Inference Execution:** `POST /api/predict-tmt` on Django ML microservice.

### Optional ECG Clinical Interpretation & AHA/ACC/HRS Criteria
- **Clinical Evaluation:** Evaluates rate, PR interval, QRS duration, QTc (Bazett/Hodges), ST-segment depression/elevation, and T-wave abnormalities against AHA/ACC/HRS consensus thresholds and PTB-XL diagnostic classification taxonomy (`NORM`, `STTC`, `CD`, `MI`, `HYP`).
- **Waveform Notice:** Distinguishes textual PDF report parameter extraction from raw 12-lead voltage waveform analysis (held for raw signal processing).

### Explainable AI (XAI) Engine & SHAP TreeExplainer
- **Model Compatibility:** Evaluates the trained `RandomForestClassifier` pipeline (`SimpleImputer` + 200-estimator decision forest) using `shap.TreeExplainer`.
- **Mathematical Consistency:** The TreeExplainer computes exact probability-space Shapley values for Class 1 (10-Year CHD). The ensemble baseline prior $E[f(x)] \approx 49.96\%$ plus the sum of all individual feature attributions equals the model predicted probability with machine precision:
  $$\text{Predicted Probability} = \text{Base Value} + \sum_{i=1}^{15} \phi_i$$
- **Feature Attribution Structure:**
  - `feature_contributions`: All 15 Framingham parameters mapped with clinical labels, formatted user inputs, raw SHAP values, risk shift percentages, and individual clinical insights.
  - `top_positive_factors`: Strongest risk-increasing contributors ($>0\%$ shift).
  - `top_negative_factors`: Strongest protective / risk-mitigating contributors ($<0\%$ shift).
  - `waterfall_steps`: Stepped progression tracking starting prior $\rightarrow$ feature-by-feature shifts $\rightarrow$ final predicted risk.
  - `global_feature_importance`: Relative Gini importances across the full ensemble, explicitly differentiated from the individual prediction.
  - `personalized_explanation`: Dynamically generated clinical narrative without hardcoded directional assumptions.
  - `disclaimer`: Rigorous medical notice clarifying that SHAP values describe mathematical algorithm behavior, not direct physiological causation.

---

## 8. API Endpoints & Request / Response Formats

All Express endpoints reside under `/api`. All successful responses adhere to the standard envelope:
```json
{
  "success": true,
  "message": "Human readable message",
  "data": { ... }
}
```

### Authentication Endpoints (`/api/auth`)
- `POST /api/auth/register`
  - **Body:** `{ firstName, lastName, email, password, phone?, gender? }`
  - **Response (201):** `{ tokens: { accessToken, tokenType, expiresIn }, user }`
- `POST /api/auth/login`
  - **Body:** `{ email, password }`
  - **Response (200):** `{ tokens: { accessToken, tokenType, expiresIn }, user }`
- `GET /api/auth/me` [Bearer JWT]
  - **Response (200):** `User` object
- `POST /api/auth/forgot-password`
  - **Body:** `{ email }`
  - **Response (200):** `{ message: string }`
- `POST /api/auth/reset-password`
  - **Body:** `{ token, password }` (where `token` is 6-digit code)
  - **Response (200):** `{ message: string }`
- `POST /api/auth/verify-email`
  - **Body:** `{ token }` (6-digit code)
  - **Response (200):** `{ message: string }`

### User Profile Endpoints (`/api`)
- `GET /api/profile` [Bearer JWT]
  - **Response (200):** `User` object
- `PUT /api/profile` [Bearer JWT]
  - **Body:** Partial user fields (`firstName`, `lastName`, `phone`, `avatarColor`, `gender`, `dateOfBirth`, `heightCm`, `weightKg`, `bloodGroup`, `allergies`, `medications`, `medicalConditions`)
  - **Response (200):** Updated `User` object
- `PUT /api/profile/password` [Bearer JWT]
  - **Body:** `{ currentPassword, newPassword }`
  - **Response (200):** `{ message: string }`

### Prediction & History Endpoints (`/api`)
- `POST /api/predict` [Bearer JWT]
  - **Body:** 15 Framingham features (`male`, `age`, `education`, `currentSmoker`, `cigsPerDay`, `BPMeds`, `prevalentStroke`, `prevalentHyp`, `diabetes`, `totChol`, `sysBP`, `diaBP`, `BMI`, `heartRate`, `glucose`) + optional `ecg` object (`heartRate`, `prInterval`, `qrsDuration`, `qtInterval`, `qtcInterval`, `stFindings`, `tWaveFindings`, `rhythm`, `interpretation`) + optional `tmt` object (`exang`, `oldpeak`, `slope`, `thalach`, `restingHR`, `restecg`, `mets`, `durationMinutes`, `reportedConclusion`).
  - **Response (201):**
    ```json
    {
      "id": "uuid",
      "riskScore": 65,
      "riskLevel": "high",
      "confidence": 72,
      "diseaseProbability": 65,
      "recommendations": ["..."],
      "contributingFactors": [{ "factor": "...", "impact": 0.9, "severity": "high", "label": "...", "detail": "..." }],
      "input": { ... },
      "ecg": { "status": "abnormal", "measurements": { ... }, "abnormalities": [...], "ptbxlDiagnosticClass": "STTC / MI", "interpretationSummary": "..." },
      "tmt": { "status": "ischemic_response", "dukeTreadmillScore": { ... }, "mlUciStressModel": { ... } },
      "submittedAt": "2026-10-15T07:18:20.123Z"
    }
    ```
- `GET /api/predict/:id` [Bearer JWT]
  - Fetches the stored prediction record with input features and optional investigation findings.
- `GET /api/predict/:id/explain` [Bearer JWT]
  - Authenticated and user-isolated endpoint that retrieves the exact stored prediction parameters and invokes the SHAP TreeExplainer engine.
  - **Response (200):**
    ```json
    {
      "predictionId": "uuid",
      "model_type": "RandomForestClassifier",
      "explanation_method": "SHAP (TreeExplainer)",
      "time_horizon": "10-Year Coronary Heart Disease Risk",
      "predicted_probability": 70.65,
      "base_value": 49.96,
      "reconstructed_probability": 70.65,
      "mathematical_consistency": true,
      "feature_contributions": [ ... ],
      "top_positive_factors": [ ... ],
      "top_negative_factors": [ ... ],
      "waterfall_steps": [ ... ],
      "global_feature_importance": [ ... ],
      "personalized_explanation": "...",
      "disclaimer": "..."
    }
    ```
- `POST /api/explain` [Django ML Service :8000]
  - **Body:** `{ "features": { ...15 Framingham parameters... } }`
  - Computes genuine SHAP values and structured explanation payload.
      "submittedAt": "2026-10-15T..."
    }
    ```
- `GET /api/predict/:id` [Bearer JWT]
  - **Response (200):** `PredictionResult` object with Framingham, ECG, and TMT findings.
- `POST /api/investigations/parse-ecg` [Bearer JWT]
  - **Payload:** `multipart/form-data` with `file: <ECG_PDF>` (up to 10MB).
  - **Response (200):** `{ success: true, documentType: "ECG", fileName, pageCount, isScanned, fields: { heartRate, prInterval, qrsDuration, qtInterval, qtcInterval, stFindings, tWaveFindings, rhythm }, reportedDiagnosis, warnings }`
- `POST /api/investigations/parse-tmt` [Bearer JWT]
  - **Payload:** `multipart/form-data` with `file: <TMT_PDF>` (up to 10MB).
  - **Response (200):** `{ success: true, documentType: "TMT", fileName, pageCount, isScanned, fields: { thalach, restingHR, mets, durationMinutes, exang, oldpeak, slope, restecg }, reportedConclusion, warnings }`
- `GET /api/history` [Bearer JWT]
  - **Query:** `page`, `pageSize`, `search`, `risk`, `sortBy`, `sortDir`
  - **Response (200):** `{ items: PredictionRecord[], total, page, pageSize, totalPages }`
- `GET /api/history/:id` [Bearer JWT]
  - **Response (200):** `PredictionRecord` object
- `DELETE /api/history/:id` [Bearer JWT]
  - **Response (200):** `{ message: string }`

### Dashboard & Analytics Endpoints (`/api`)
- `GET /api/dashboard` [Bearer JWT]
  - **Response (200):** `{ healthScore, riskLevel, riskScore, recentPredictions, metrics, totalPredictions, monthPredictions, streakDays }`
- `GET /api/dashboard/notifications` [Bearer JWT]
  - **Response (200):** `AppNotification[]`
- `GET /api/dashboard/activities` [Bearer JWT]
  - **Response (200):** `ActivityEvent[]`
- `GET /api/dashboard/tips` [Bearer JWT]
  - **Response (200):** `HealthTip[]`
- `GET /api/analytics` [Bearer JWT]
  - **Response (200):** `{ totalPredictions, totalUsers, avgRiskScore, highRiskRate, riskDistribution, genderDistribution, ageDistribution, monthlyPredictions }`

### Admin Endpoints (`/api/admin`)
- `GET /api/admin/stats` [Bearer JWT + admin role]
  - **Response (200):** `AdminStats` object
- `GET /api/admin/users` [Bearer JWT + admin role]
  - **Query:** `search`
  - **Response (200):** `AdminUserRow[]`
- `DELETE /api/admin/users/:id` [Bearer JWT + admin role]
  - **Response (200):** `{ message: string }`
- `GET /api/admin/activities` [Bearer JWT + admin role]
  - **Response (200):** `AdminActivity[]`

### System Health
- `GET /api/health`
  - **Response (200 / 503):** `{ status: "up", database: "connected"|"unavailable", uptime: number, timestamp: string }`

### Internal Django ML Endpoints (`http://localhost:8000/api`)
- `GET /api/health` -> `{ success: true, status: "up" }`
- `POST /api/predict` -> `{ success: true, prediction: 0|1, probability: float, risk_score: float, message: string }`

---

## 9. Authentication & Authorization Flow

1. **User Sign Up / Sign In:**
   - Password hashed with `bcrypt.hash(password, 10)` before storage.
   - JWT signed with `jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn })`.
2. **Session Storage:**
   - Stored in client `localStorage` under `cardiosight_token` and `cardiosight_user`.
   - Propagated across the frontend using Angular Signals.
3. **Protected Route Requests:**
   - `authInterceptor` reads `authService.accessToken()` and sets `Authorization: Bearer <token>` on all requests.
4. **Backend Verification:**
   - `authenticate` middleware verifies signature against `JWT_SECRET`.
   - Queries `users` table with `payload.sub`. If user does not exist, returns 401. Attaches user to `req.user`.
5. **Role-Based Authorization:**
   - `requireRole('admin')` validates `req.user.role === 'admin'`. Rejects with 403 if unauthorized.
6. **Password Reset / Email Verification Flow:**
   - 6-digit random code generated, hashed using SHA-256, and stored in `verification_codes` with a 30-minute expiration.
   - Code verification marks the code as `used = TRUE` and verifies `expires_at > now()`.

---

## 10. Required Environment Variables

### Backend (`Backend/.env`)
- `PORT`
- `DATABASE_URL` (or `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `ML_SERVER_URL`
- `CORS_ORIGINS`
- `ADMIN_EMAIL` (optional seeder variable)
- `ADMIN_PASSWORD` (optional seeder variable)

### Django ML Service (`ML/`)
- `DJANGO_SECRET_KEY` (defaults to dev fallback if unset)
- `DJANGO_DEBUG` (defaults to `1` if unset)

### Frontend (`Frontend/src/environments/environment.ts`)
- `apiUrl` (default: `http://localhost:3000/api`)
- `useMock` (default: `false`)
- `mockDelay` (default: `900`)
- `mlApiUrl` (*unused legacy property, default: `http://localhost:5000`*)

---

## 11. Commands to Run the Application

```bash
# -------------------------------------------------------------
# 1. Database Setup (PostgreSQL must be running on port 5432)
# -------------------------------------------------------------
cd Backend
npm run db:init      # Applies schema.sql to PostgreSQL
npm run db:seed      # Seeds the default administrator account

# -------------------------------------------------------------
# 2. Django ML Microservice (Terminal 1 - Port 8000)
# -------------------------------------------------------------
cd ML
source .venv_fixed/bin/activate
python manage.py runserver 8000

# -------------------------------------------------------------
# 3. Express API Gateway (Terminal 2 - Port 3000)
# -------------------------------------------------------------
cd Backend
npm start            # Or: npm run dev (for nodemon auto-restart)

# -------------------------------------------------------------
# 4. Angular 20 Frontend (Terminal 3 - Port 4200)
# -------------------------------------------------------------
cd Frontend
npm start            # Runs: ng serve --port 4200

# -------------------------------------------------------------
# 5. Automated Verification & Regression Test Suites
# -------------------------------------------------------------
cd Backend
node test_xai.js            # 36 tests: SHAP TreeExplainer, math consistency, security, isolation
node test_investigations.js # 31 tests: ECG & TMT multi-model investigations & PDF parsing
```

---

## 12. Known Bugs, Limitations & Incomplete Features

### Confirmed Bugs (Verified in Code)
1. **`confidence` Metric Defaults to `0` in Predictions:**
   - In `ML/mlapp/views.py`, the Django view does not return a `confidence` field in the JSON response.
   - In `Backend/services/mlService.js`, the code executes `data.confidence ?? 0`.
   - Consequence: Every prediction saved to the database and displayed on the UI shows `0%` confidence.
2. **Platform Analytics Gender Distribution Key Mismatch:**
   - In `Backend/controllers/analyticsController.js`, line 30 checks `(r.input || {}).gender === 'male'`.
   - The Framingham dataset and form store biological sex as `input.male === 1` or `0`.
   - Consequence: Male count in platform analytics always evaluates to `0`.
3. **`RiskMeterComponent` SVG Arc Radius Bug:**
   - In `Frontend/src/app/shared/components/risk-meter/risk-meter.component.ts`, line 139 defines `private readonly radius = 8;`.
   - Consequence: In a 240px wide gauge, the SVG arc renders with an 8px radius, and tick calculations (`radius - 9`) yield negative coordinates.
4. **Orphaned / Broken Training Scripts:**
   - `ML/mlapp/train.py` imports `build_row_dict` from `.preprocess`, which no longer exists after the Framingham migration. Running it results in `ImportError`.
   - `train_framingham.py` at the project root points to `Path(__file__).resolve().parent.parent / "framingham.csv"` which looks outside the project directory.

### Limitations & Incomplete Features
1. **Email Service Delivery Not Integrated:**
   - Email verification and password reset codes are hashed into PostgreSQL, but no external email provider (SMTP/Nodemailer/SendGrid) is connected. In development, codes are returned inside the API response message.
2. **Admin User Suspension Not Persisted:**
   - In `Frontend/src/app/features/admin/admin-users.component.ts`, `suspend()` only triggers a UI toast without backend API support or a database status field.
3. **Dead Configuration in Frontend Environment:**
   - `Frontend/src/environments/environment.ts` contains `mlApiUrl: 'http://localhost:5000'`. The frontend never calls ML directly; all traffic routes through Express (`http://localhost:3000/api`).
4. **Outdated Landing Page Marketing Copy:**
   - `LandingPageComponent` mentions sleep disorders, snoring, and gradient boosting, reflecting an earlier prototype before the Framingham RandomForest migration.

---

## 13. Development Constraints & Conventions

- **Module System:**
  - Backend uses CommonJS (`require` / `module.exports`).
  - Frontend uses ES Modules with Angular Standalone Components.
  - ML uses Python 3 with Django and Scikit-learn.
- **Framingham Feature Consistency:**
  - Feature names must strictly match the 15 keys: `male`, `age`, `education`, `currentSmoker`, `cigsPerDay`, `BPMeds`, `prevalentStroke`, `prevalentHyp`, `diabetes`, `totChol`, `sysBP`, `diaBP`, `BMI`, `heartRate`, `glucose`.
- **API Response Envelope:**
  - All new backend endpoints must adhere to `{ success: boolean, message?: string, data?: T }`.
- **No Direct Frontend-to-ML Communication:**
  - The frontend must never call the Django ML service directly. All inference requests must pass through the Express gateway for authentication, validation, and database storage.

---

## 14. Checklist of Files to Inspect Before Modifying Components

### When Modifying the Machine Learning Pipeline:
- [ ] `ML/mlapp/train_framingham.py` (Active training script)
- [ ] `ML/mlapp/preprocess.py` (Feature validation and DataFrame builder)
- [ ] `ML/mlapp/model_store.py` (Model loading and caching)
- [ ] `ML/mlapp/views.py` (Django prediction HTTP handler)
- [ ] `Backend/services/mlService.js` (Express ML client and factor rules)

### When Modifying Prediction Intake or Results:
- [ ] `Frontend/src/app/core/models/prediction.model.ts` (TypeScript interfaces)
- [ ] `Frontend/src/app/features/prediction/prediction-form.component.ts` (Form controls and validation)
- [ ] `Frontend/src/app/features/prediction-result/prediction-result.component.ts` (Result display logic)
- [ ] `Backend/controllers/predictionController.js` (Payload validation and PostgreSQL persistence)
- [ ] `Backend/services/mlService.js` (Factor extraction and recommendation builder)

### When Modifying Authentication or User Profiles:
- [ ] `Backend/controllers/authController.js` (Token creation, password hashing, OTP handling)
- [ ] `Backend/middleware/auth.js` (JWT authentication middleware)
- [ ] `Frontend/src/app/core/services/auth.service.ts` (Session storage and token injection)
- [ ] `Frontend/src/app/core/interceptors/auth.interceptor.ts` (Bearer token header injection)
- [ ] `Backend/config/schema.sql` (User table definition)

### When Modifying the Database Schema:
- [ ] `Backend/config/schema.sql` (DDL definitions)
- [ ] `Backend/config/initDb.js` (Schema runner)
- [ ] `Backend/config/seed.js` (Admin account seeder)
- [ ] `Backend/controllers/predictionController.js` (SQL queries)
- [ ] `Backend/controllers/dashboardController.js` (Dashboard queries)
- [ ] `Backend/controllers/adminController.js` (Admin queries)
