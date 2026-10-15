# CardioSight: Comprehensive Technical & Architectural Documentation

This document provides complete, verified technical documentation for the **CardioSight** Cardiovascular Risk Prediction & Decision Support System. It details system architecture, directory layouts, database schemas, machine learning pipelines, Explainable AI (SHAP) mathematical formulations, clinical investigation parsing algorithms, and security implementations.

---

## 1. System Architecture & Communication Flow

CardioSight adopts a decoupled microservice architecture ensuring clear separation of concerns, scalability, and independent deployment cycles:

```text
                               +------------------------------------------+
                               |        Angular 20 Frontend (SPA)         |
                               |          http://localhost:4200           |
                               +------------------------------------------+
                                                    |
                                          HTTP / REST (JSON)
                                         Bearer JWT Authorization
                                                    v
                               +------------------------------------------+
                               |     Node.js / Express API Gateway        |
                               |          http://localhost:3000           |
                               +------------------------------------------+
                                    |                           |
                       PostgreSQL Relational DB        HTTP / REST (JSON)
                         localhost:5432 / pg-pool      Internal Microservice
                                    |                           |
                                    v                           v
                        +----------------------+    +----------------------+
                        | PostgreSQL Database  |    |  Django ML Service   |
                        | (Users, Predictions, |    |   127.0.0.1:8000     |
                        |   Cached SHAP, DTS)  |    | (Scikit-learn, SHAP) |
                        +----------------------+    +----------------------+
```

### Communication Protocols
1. **Frontend to Gateway**: Browser communicates with Express at `http://localhost:3000/api` over HTTP using `HttpClient` with automatic envelope unwrapping (`{ success: true, message: string, data: T }`) and JWT bearer authorization.
2. **Gateway to ML Service**: Express communicates with Django via internal HTTP calls at `http://127.0.0.1:8000/api` using Axios with strict timeouts (10s for explain, 15s for predict).
3. **Gateway to Database**: Native PostgreSQL connection pooling managed via `pg` (`pg.Pool`), supporting connection strings (`DATABASE_URL`) or individual parameters (`PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`).

---

## 2. Directory Structure

```text
CardioSight_FIXED/
├── Backend/                            # Node.js + Express API Gateway
│   ├── config/                         # Database connection, schemas, and seeders
│   │   ├── db.js                       # PostgreSQL connection pool configuration
│   │   ├── initDb.js                   # Schema execution runner (npm run db:init)
│   │   ├── schema.sql                  # Idempotent DDL definitions & indexes
│   │   └── seed.js                     # Default administrator seeder (npm run db:seed)
│   ├── controllers/                    # Route business logic handlers
│   │   ├── adminController.js          # User management and platform statistics
│   │   ├── authController.js           # Registration, login, verification, and profile
│   │   ├── dashboardController.js      # Aggregated metric feeds, health score, activities
│   │   ├── investigationController.js  # Multipart PDF upload and parsing entry points
│   │   └── predictionController.js     # Risk calculation, DB caching, and SHAP dispatch
│   ├── middleware/                     # Express pipeline interceptors
│   │   ├── auth.js                     # JWT verification & req.user attachment
│   │   └── errorHandler.js             # Centralized HTTP error handler & HttpError class
│   ├── routes/                         # Express router module declarations
│   ├── services/                       # Core analytical & integration engines
│   │   ├── ecgService.js               # AHA/ACC clinical heuristic evaluator
│   │   ├── mlService.js                # Communication layer with Django ML microservice
│   │   ├── pdfExtractorService.js      # Robust medical PDF text extraction & tokenization
│   │   └── tmtService.js               # Duke Treadmill Score & UCI model dispatcher
│   ├── .env.example                    # Template environment variables
│   ├── package.json                    # Backend npm dependencies and test scripts
│   ├── server.js                       # Express app bootstrap, CORS, and port listening
│   ├── test_auth_dashboard.js          # Automated auth & user isolation test suite (36 tests)
│   ├── test_investigations.js          # Automated ECG/TMT PDF parsing test suite (104 tests)
│   └── test_xai.js                     # Automated SHAP mathematical test suite (36 tests)
│
├── Frontend/                           # Angular 20 Single Page Application
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/                   # Singleton services, guards, and interceptors
│   │   │   │   ├── guards/             # Route authorization guards (authGuard, adminGuard)
│   │   │   │   ├── interceptors/       # HTTP auth token & error interceptors
│   │   │   │   ├── models/             # Domain TypeScript interfaces (prediction, user, etc.)
│   │   │   │   └── services/           # ApiService, AuthService, PredictionService, ToastService
│   │   │   ├── features/               # Functional page views
│   │   │   │   ├── admin/              # User management & administration dashboard
│   │   │   │   ├── analytics/          # Population-level risk distribution analytics
│   │   │   │   ├── auth/               # Login, registration, password recovery views
│   │   │   │   ├── dashboard/          # Patient profile, health score, recent assessments
│   │   │   │   ├── history/            # Searchable, sortable assessment records table
│   │   │   │   ├── prediction/         # 6-step wizard (Framingham, ECG upload, TMT upload)
│   │   │   │   └── prediction-result/  # Results view, SHAP waterfall, ECG/TMT interpretations
│   │   │   └── shared/                 # Reusable UI components (ChartWidget, RiskMeter, etc.)
│   │   ├── environments/               # Environment configurations (environment.ts)
│   │   ├── index.html                  # HTML entry point
│   │   └── styles.scss                 # Global CSS tokens, dark/light themes, typography
│   ├── angular.json                    # Angular CLI build targets & asset configurations
│   └── package.json                    # Frontend dependencies (Angular Material, Chart.js)
│
├── ML/                                 # Django Machine Learning Microservice
│   ├── cardiosight_ml/                 # Django project settings and root urlconf
│   │   ├── settings.py                 # Installed apps, middleware, and CORS configuration
│   │   └── urls.py                     # Root API router (/api/...)
│   ├── data/                           # Verified source datasets
│   │   ├── framingham.csv              # Framingham Heart Study dataset (n=4,238)
│   │   └── processed.cleveland.data    # UCI Cleveland Heart Disease dataset (n=303)
│   ├── mlapp/                          # Machine learning application package
│   │   ├── model_artifacts/            # Serialized trained scikit-learn models
│   │   │   ├── model.joblib            # Framingham RandomForestClassifier pipeline
│   │   │   └── tmt_uci_model.joblib    # UCI Cleveland TMT Stress RandomForest pipeline
│   │   ├── explainer.py                # SHAP TreeExplainer engine & waterfall generator
│   │   ├── model_store.py              # Thread-safe model artifact loader
│   │   ├── preprocess.py               # Input DataFrame builder & validation rules
│   │   ├── train_uci_tmt.py            # UCI TMT model training & validation script
│   │   └── views.py                    # Django view handlers (/api/predict, /api/explain)
│   ├── manage.py                       # Django CLI administration entry point
│   └── requirements.txt                # Python dependencies (Django, scikit-learn, SHAP)
│
├── PROFESSOR_SETUP_GUIDE.md            # Detailed beginner installation manual
├── PROFESSOR_QUICK_START.md            # 1-page daily cheatsheet
├── README.md                           # Main repository overview
├── test_ecg_report.pdf                 # Verified 12-lead ECG PDF report for live evaluation
└── test_tmt_report.pdf                 # Verified TMT stress PDF report for live evaluation
```

---

## 3. Database Schema (PostgreSQL)

The database schema is defined in [schema.sql](file:///Users/utkarshsood/Downloads/CardioSight_FIXED/Backend/config/schema.sql) and uses PostgreSQL native UUIDs and `jsonb` fields for unstructured medical data:

### Table: `users`
Stores user authentication details and demographic baselines:
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY, DEFAULT gen_random_uuid() | Unique user identifier |
| `first_name` | `VARCHAR(100)` | NOT NULL | User first name |
| `last_name` | `VARCHAR(100)` | NOT NULL | User last name |
| `email` | `VARCHAR(255)` | NOT NULL, UNIQUE | User email address |
| `password_hash`| `TEXT` | NOT NULL | Bcrypt password hash (10 rounds) |
| `phone` | `VARCHAR(50)` | NOT NULL DEFAULT '' | Contact telephone |
| `role` | `VARCHAR(20)` | CHECK (role IN ('patient', 'admin')) | Authorization role |
| `avatar_color` | `VARCHAR(20)` | DEFAULT '#43A047' | UI profile avatar color token |
| `gender` | `VARCHAR(10)` | CHECK (gender IN ('male', 'female', 'other')) | Biological sex |
| `date_of_birth`| `DATE` | NULL | Date of birth |
| `height_cm` | `NUMERIC(5,1)` | NULL | Stature in centimeters |
| `weight_kg` | `NUMERIC(5,1)` | NULL | Mass in kilograms |
| `blood_group` | `VARCHAR(5)` | NULL | ABO blood group |
| `allergies` | `JSONB` | NOT NULL DEFAULT '[]' | Clinical allergies list |
| `medications` | `JSONB` | NOT NULL DEFAULT '[]' | Active pharmacological therapies |
| `medical_conditions` | `JSONB`| NOT NULL DEFAULT '[]' | Chronic diagnoses list |
| `is_email_verified`| `BOOLEAN`| NOT NULL DEFAULT FALSE | Email verification status |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | Registration timestamp |

### Table: `patients`
One-to-one clinical extension of users:
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY | Unique patient record identifier |
| `user_id` | `UUID` | UNIQUE, REFERENCES users(id) ON DELETE CASCADE | Associated user account |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | Clinical file establishment date |

### Table: `predictions`
Stores all completed cardiac assessments, clinical inputs, and explanations:
| Column | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | PRIMARY KEY, DEFAULT gen_random_uuid() | Assessment identifier |
| `user_id` | `UUID` | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Patient user ID |
| `patient_id` | `UUID` | REFERENCES patients(id) ON DELETE SET NULL | Patient record reference |
| `prediction` | `VARCHAR(50)` | NULL | Model risk text label |
| `risk_level` | `VARCHAR(10)` | CHECK (risk_level IN ('low', 'medium', 'high')) | Standardized risk tier |
| `risk_score` | `NUMERIC(5,1)` | NULL | Calibrated risk probability (0–100%) |
| `confidence` | `NUMERIC(5,1)` | NULL | Decision boundary certainty (0–100%) |
| `probability` | `NUMERIC(5,1)` | NULL | Raw model probability |
| `status` | `VARCHAR(20)` | CHECK (status IN ('completed', 'processing', 'failed')) | Calculation status |
| `input` | `JSONB` | NOT NULL DEFAULT '{}' | Complete input (15 Framingham + ECG + TMT) |
| `recommendations` | `JSONB` | NOT NULL DEFAULT '[]' | Personalized clinical action items |
| `contributing_factors` | `JSONB`| NOT NULL DEFAULT '[]' | Primary Framingham biometric drivers |
| `explanation` | `JSONB` | NULL | **Cached SHAP explanation & waterfall steps** |
| `created_at` | `TIMESTAMPTZ` | DEFAULT now() | Assessment completion timestamp |

*Indexes*:
- `idx_predictions_user_id`: Fast query filtering by authenticated user.
- `idx_predictions_created_at`: Optimized descending sort for chronological history feeds.

---

## 4. API Endpoints Reference

All endpoints (except health and public auth) require the `Authorization: Bearer <JWT>` header:

| Method | Endpoint | Description | Status Code |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/health` | Gateway & Database Health Check | 200 OK |
| `POST` | `/api/auth/register` | Create a new user account | 201 Created |
| `POST` | `/api/auth/login` | Authenticate and obtain JWT access token | 200 OK |
| `GET` | `/api/auth/me` | Fetch active authenticated session details | 200 OK |
| `GET` | `/api/dashboard` | Aggregated dashboard stats, health score, predictions | 200 OK |
| `POST` | `/api/predict` | Submit 15 Framingham features + optional ECG/TMT | 201 Created |
| `GET` | `/api/predict/:id` | Retrieve completed assessment result | 200 OK |
| `GET` | `/api/predict/:id/explain` | **Fetch genuine SHAP TreeExplainer attributions (Cached)** | 200 OK |
| `GET` | `/api/history` | Paginated, searchable assessment history | 200 OK |
| `DELETE`| `/api/history/:id` | Delete a single prediction record | 200 OK |
| `POST` | `/api/investigations/parse-ecg` | Multipart PDF upload for 12-lead ECG extraction | 200 OK |
| `POST` | `/api/investigations/parse-tmt` | Multipart PDF upload for TMT stress test extraction | 200 OK |
| `GET` | `http://127.0.0.1:8000/api/health` | Django Machine Learning service health check | 200 OK |
| `POST` | `http://127.0.0.1:8000/api/predict` | Internal Framingham model inference | 200 OK |
| `POST` | `http://127.0.0.1:8000/api/predict-tmt` | Internal UCI TMT model inference | 200 OK |
| `POST` | `http://127.0.0.1:8000/api/explain` | Internal SHAP TreeExplainer calculation | 200 OK |

---

## 5. Machine Learning Models & Methodology

CardioSight employs two genuine, calibrated clinical machine learning models:

### Model A: Primary 10-Year CHD Risk Model (Framingham)
- **Dataset**: Framingham Heart Study prospective epidemiological cohort ($n = 4,238$, 15 baseline clinical features).
- **Target**: `TenYearCHD` (binary: development of coronary heart disease event within a 10-year follow-up window).
- **Model Architecture**: Scikit-learn `Pipeline`:
  1. `SimpleImputer(strategy="median")`: Robust median imputation for clinical measurements with missing values.
  2. `StandardScaler()`: Zero-mean, unit-variance feature standardization.
  3. `RandomForestClassifier`: Ensemble of 100 decision trees with balanced class weighting to handle class imbalance ($~15\%$ positive prevalence).
- **15 Standard Input Biomarkers**:
  `male` (0/1), `age` (years), `education` (1–4), `currentSmoker` (0/1), `cigsPerDay`, `BPMeds` (0/1), `prevalentStroke` (0/1), `prevalentHyp` (0/1), `diabetes` (0/1), `totChol` (mg/dL), `sysBP` (mmHg), `diaBP` (mmHg), `BMI` (kg/m²), `heartRate` (bpm), `glucose` (mg/dL).

### Model B: Exercise-Induced Myocardial Ischemia Model (UCI Cleveland)
- **Dataset**: UCI Machine Learning Repository Heart Disease dataset (Cleveland Clinic Foundation, $n = 303$).
- **Target**: Angiographic Coronary Artery Disease ($ \ge 50\%$ diameter stenosis).
- **Model Architecture**:
  1. `SimpleImputer(strategy="median")`
  2. `StandardScaler()`
  3. `RandomForestClassifier(n_estimators=100, max_depth=6, random_state=42)`
- **Validated Performance Metrics on Held-Out Test Set ($n = 61$)**:
  - **Accuracy**: $81.97\%$
  - **ROC-AUC**: $0.9545$
  - **Sensitivity (Recall)**: $82.14\%$
  - **Specificity**: $81.82\%$

---

## 6. Explainable AI (XAI) & SHAP Mathematics

To prevent "black box" decisions, CardioSight integrates **SHAP (SHapley Additive exPlanations)** based on cooperative game theory:

### Mathematical Additive Identity
For any patient profile $x$, the model prediction probability $f(x)$ is represented as:

$$f(x) = E[f(x)] + \sum_{i=1}^{M} \phi_i(x)$$

Where:
- $E[f(x)]$ is the **Model Baseline Prior** (the average expected probability across the training population, $\approx 49.96\%$).
- $\phi_i(x)$ is the **SHAP attribution** for feature $i$.
- $M$ is the number of features ($15$).

### Mathematical Consistency Verification
In `explainer.py`, every explanation computes:
$$\text{Reconstructed Probability} = \text{base\_value} + \sum_{i=1}^{15} \phi_i$$
The API validates that $|\text{Predicted} - \text{Reconstructed}| < 0.2\%$, returning `mathematical_consistency: true`.

### Waterfall Progression
Features are sorted by their absolute impact $|\phi_i|$:
$$\text{Running Total}_k = \text{base\_value} + \sum_{j=1}^{k} \phi_j$$
This enables the interactive waterfall chart to demonstrate step-by-step how the baseline prior is adjusted to reach the individual prediction.

---

## 7. Clinical Investigation Pipelines

### A. ECG Report Parser & Heuristics
- **PDF Extraction**: `pdfExtractorService.js` extracts raw text and tokens using `pdf-parse`.
- **Regex Boundary Matching**: Uses clinical regex patterns with word boundaries (e.g., `/\b(?:ventricular\s+rate|heart\s+rate|hr)\b[\s:=]+(\d{2,3})\b/i`) preventing false positive digit captures.
- **AHA/ACC Normal Clinical Thresholds**:
  - Heart Rate: 60–100 bpm (flagged if $<60$ Bradycardia, $>100$ Tachycardia).
  - PR Interval: 120–200 ms (flagged if $>200$ First-Degree AV Block, $<120$ Pre-excitation).
  - QRS Duration: $<120$ ms (flagged if $\ge 120$ Intraventricular Conduction Delay / Bundle Branch Block).
  - QTc Interval: Men $\le 450$ ms, Women $\le 460$ ms (flagged if $>460$ Prolonged QTc / Arrhythmia risk).
- **PTB-XL Diagnostic Classification**: Maps extracted repolarization anomalies to standardized clinical categories (`NORM`, `MI`, `STTC`, `HYP`).

### B. Treadmill Test (TMT) & Duke Treadmill Score (DTS)
Calculated using the validated clinical formula:

$$\text{DTS} = \text{Exercise Time (min)} - (5 \times \text{ST Depression in mm}) - (4 \times \text{Angina Index})$$

Where:
- Angina Index: `0` = No angina, `1` = Non-limiting exercise angina, `2` = Exercise-limiting angina.
- **Risk Stratification**:
  - **Low Risk ($\text{DTS} \ge +5$)**: 5-year survival $\approx 97\%$, average annual mortality $<1\%$.
  - **Moderate Risk ($-10 \le \text{DTS} < +5$)**: Average annual mortality $\approx 1.25\% - 2.5\%$.
  - **High Risk ($\text{DTS} < -10$)**: Average annual mortality $>5\%$, recommended for direct coronary angiography.

---

## 8. Security, Authentication & Data Protection

1. **Authentication**: Stateless JSON Web Tokens (JWT) signed using HS256 with 7-day expiration.
2. **Password Hashing**: Bcrypt with a work factor of 10 salt rounds. Plaintext passwords are never logged or stored.
3. **User Isolation**: All queries enforce strict ownership predicates (`WHERE id = $1 AND user_id = $2`), preventing horizontal privilege escalation across patients.
4. **CORS Restrictions**: Express enforces configurable origin white-listing (`CORS_ORIGINS`).
5. **No Synthetic Value Fabrication**: If an ECG or TMT report lacks a measurement, the system sets it to `null` rather than fabricating clinical numbers or defaulting to zero.

---

## 9. Automated Test Verification Summary

CardioSight contains **176 comprehensive automated test cases** that execute in $< 5$ seconds:

| Test Suite | File | Tests | Status | Scope |
| :--- | :--- | :--- | :--- | :--- |
| **Investigations** | `test_investigations.js` | **104** | **104 Passed** | ECG/TMT PDF parsing, boundary regexes, AHA/ACC threshold heuristics, Duke score calculation. |
| **Auth & Dashboard**| `test_auth_dashboard.js` | **36** | **36 Passed** | JWT login, password verification, user isolation, data integrity, dashboard metric aggregation. |
| **Explainable AI** | `test_xai.js` | **36** | **36 Passed** | SHAP TreeExplainer, additive identity consistency ($P = \text{base} + \sum \phi$), waterfall step continuity, error handling. |
| **Total** | | **176** | **100% Passed** | **Zero Failures** |

Run all tests anytime with:
```bash
cd Backend
node test_investigations.js && node test_auth_dashboard.js && node test_xai.js
```
