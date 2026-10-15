# CardioSight: Daily Quick-Start Cheatsheet (1-Page Guide)

Use this quick reference card to start CardioSight on days **after** your first-time setup has already been completed.

---

## ⚡ Daily Startup in 3 Steps

Open **three separate Terminal windows** and run one command in each:

### Terminal Window 1: Machine Learning & SHAP Service
```bash
cd CardioSight/ML
source .venv/bin/activate        # On Windows: .venv\Scripts\activate
python manage.py runserver 127.0.0.1:8000
```
> *Leave Window 1 open.* (Confirms: `Starting development server at http://127.0.0.1:8000/`)

---

### Terminal Window 2: Express Backend Gateway
```bash
cd CardioSight/Backend
npm start
```
> *Leave Window 2 open.* (Confirms: `CardioSight API listening on http://localhost:3000`)

---

### Terminal Window 3: Angular Frontend
```bash
cd CardioSight/Frontend
npm start
```
> *Leave Window 3 open.* (Confirms: `Angular Live Development Server is listening on localhost:4200`)

---

## 🌐 Open the Application

Open your web browser (Google Chrome, Safari, Edge, or Firefox) and go to:

👉 **`http://localhost:4200`**

---

## 🔑 Login Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Administrator / Evaluator** | `admin@cardiosight.local` | `Admin@12345` |

*(Or click "Create an account" to register a new user profile).*

---

## 🚦 System Health Check Table

To verify that each service is responding, you can check these endpoints:

| Service | Port | Local URL | Expected Response |
| :--- | :--- | :--- | :--- |
| **Frontend UI** | `4200` | `http://localhost:4200` | CardioSight Web Portal |
| **Backend Gateway** | `3000` | `http://localhost:3000/api/health` | `{"success":true,"status":"up","database":"connected"}` |
| **ML Microservice** | `8000` | `http://127.0.0.1:8000/api/health` | `{"success":true,"status":"up"}` |
| **PostgreSQL** | `5432` | `localhost:5432` | Active PostgreSQL Server |

---

## 📁 Sample PDF Reports for Testing

Included in the root `CardioSight/` directory:
- **`test_ecg_report.pdf`**: 12-lead ECG report with clinical conduction intervals (Heart Rate: 72 bpm, PR: 160 ms, QRS: 90 ms, QT: 380 ms).
- **`test_tmt_report.pdf`**: Exercise stress test report with treadmill findings (Max HR: 155 bpm, 10.5 METs, 1.2 mm ST depression).

---

## 🛑 How to Stop All Services

Click inside each of the 3 Terminal windows and press:
```text
Control + C
```

---
*For initial first-time installation and troubleshooting, refer to [PROFESSOR_SETUP_GUIDE.md](./PROFESSOR_SETUP_GUIDE.md).*
