# CardioSight: Complete Step-by-Step Installation & User Guide

Welcome to the **CardioSight** setup manual. This document is written specifically for professors, academic evaluators, and reviewers who want to install, run, and evaluate the complete CardioSight application on their own computer with ease.

No prior experience with software development, web frameworks, or terminal scripting is required. Every step is explained patiently, in plain English, with exact commands you can copy and paste directly into your computer.

---

## Table of Contents

1. [Understanding the Basics](#1-understanding-the-basics)
2. [What CardioSight Does](#2-what-cardiosight-does)
3. [Required Software Checklist](#3-required-software-checklist)
4. [STEP 1: Download CardioSight from GitHub](#step-1-download-cardiosight-from-github)
5. [STEP 2: Set Up the PostgreSQL Database](#step-2-set-up-the-postgresql-database)
6. [STEP 3: Start the Machine Learning Service (Terminal Window 1)](#step-3-start-the-machine-learning-service-terminal-window-1)
7. [STEP 4: Start the Backend API Server (Terminal Window 2)](#step-4-start-the-backend-api-server-terminal-window-2)
8. [STEP 5: Start the Frontend Web Application (Terminal Window 3)](#step-5-start-the-frontend-web-application-terminal-window-3)
9. [STEP 6: Open CardioSight in Your Web Browser](#step-6-open-cardiosight-in-your-web-browser)
10. [STEP 7: Step-by-Step Demonstration Walkthrough](#step-7-step-by-step-demonstration-walkthrough)
    - [A. Logging in](#a-logging-in)
    - [B. Running a Framingham CHD Assessment](#b-running-a-framingham-chd-assessment)
    - [C. Understanding the SHAP Explainable AI Results](#c-understanding-the-shap-explainable-ai-results)
    - [D. Testing ECG Report PDF Analysis](#d-testing-ecg-report-pdf-analysis)
    - [E. Testing Treadmill Test (TMT) Stress Analysis](#e-testing-treadmill-test-tmt-stress-analysis)
    - [F. Viewing History and Downloading Clinical Reports](#f-viewing-history-and-downloading-clinical-reports)
11. [STEP 8: How to Safely Stop CardioSight](#step-8-how-to-safely-stop-cardiosight)
12. [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## 1. Understanding the Basics

Before we begin, here are a few simple definitions of words used in this guide:

- **Terminal (or Command Prompt)**: A built-in application on your computer where you run programs by typing or pasting text instructions instead of clicking buttons.
  - On **Mac**: Press `Command + Space`, type `Terminal`, and press `Return`.
  - On **Windows**: Press the `Windows Key`, type `PowerShell` or `cmd`, and press `Enter`.
- **Directory / Folder**: A folder on your computer that stores files.
- **Copy and Paste**: To copy a command from this guide, highlight it and press `Command + C` (Mac) or `Ctrl + C` (Windows). To paste it into your Terminal, click inside the Terminal window and press `Command + V` (Mac) or `Ctrl + V` (Windows), then press the **Return / Enter** key on your keyboard.
- **Port**: A numbered communication channel (like a telephone extension) that allows your web browser to talk to a specific service running locally on your computer.
- **Localhost**: A special web address that points directly to your own computer (`http://localhost:4200`), meaning the website runs privately on your machine without sending data across the public internet.

---

## 2. What CardioSight Does

CardioSight is a clinical decision-support application designed to evaluate cardiac disease risk using four coordinated components:

1. **PostgreSQL Database**: Securely stores user profiles, patient clinical histories, and test results.
2. **Django Machine Learning Service**: Runs genuine scikit-learn models and SHAP (SHapley Additive exPlanations) algorithms to quantify risk and explain exactly *why* a prediction was made.
3. **Node.js Express Backend Gateway**: Coordinates requests, verifies security credentials (JWT), and extracts data from medical PDF reports.
4. **Angular Frontend**: The interactive website that you see and interact with in your web browser.

Because each component performs a distinct function, you will run the services in **three separate Terminal windows**. Each window must remain open while you are demonstrating the application.

---

## 3. Required Software Checklist

Before starting CardioSight, verify that your computer has the four standard prerequisite tools installed. Most academic and university computers already have these tools.

| Required Tool | Minimum Version | How to Check if Already Installed | Official Download Page |
| :--- | :--- | :--- | :--- |
| **Git** | Any modern version | Open Terminal, type `git --version` | [git-scm.com](https://git-scm.com/downloads) |
| **Node.js** | Version 18, 20, 22, or 26 | Open Terminal, type `node --version` | [nodejs.org](https://nodejs.org/) (Download LTS) |
| **Python** | Version 3.10, 3.11, 3.12, 3.13, or 3.14 | Open Terminal, type `python3 --version` | [python.org](https://www.python.org/downloads/) |
| **PostgreSQL** | Version 14, 15, 16, or 17 | Open Terminal, type `psql --version` | [postgresql.org](https://www.postgresql.org/download/) |

### Quick Installation for Mac Users (Recommended)
If you use a Mac with Homebrew, you can install everything in one command:
```bash
brew install git node python postgresql@16
brew services start postgresql@16
```

### Quick Installation for Windows Users
If you use Windows:
1. Download and run the **Node.js LTS** installer from [nodejs.org](https://nodejs.org/).
2. Download and run the **Python 3** installer from [python.org](https://www.python.org/) (ensure you check the box that says *"Add python.exe to PATH"* during setup).
3. Download and install **PostgreSQL** from [postgresql.org](https://www.postgresql.org/download/windows/) (choose a simple password like `postgres` or `cardiosight` when prompted).
4. Download **Git** from [git-scm.com](https://git-scm.com/).

---

## STEP 1: Download CardioSight from GitHub

Open a new **Terminal** window and download the project into your user folder:

```bash
git clone https://github.com/krishna45-tech/MP-CHD.git CardioSight
cd CardioSight
```

> **What this does**: It downloads the complete CardioSight project into a folder called `CardioSight` and enters that folder.

If you already have the folder unzipped on your computer, simply navigate into it:
```bash
cd /path/to/CardioSight
```

---

## STEP 2: Set Up the PostgreSQL Database

CardioSight needs a local database to save user accounts and cardiac records.

### 2.1 Start the PostgreSQL Service

**On macOS**:
```bash
brew services start postgresql@16
```
*(If you have a different PostgreSQL version installed, such as version 15 or 17, Homebrew will start it automatically).*

**On Windows**:
PostgreSQL starts automatically as a background Windows service after installation. You can verify it is active by opening the Windows Start Menu, searching for *Services*, and checking that *postgresql-x64* status shows *Running*.

---

### 2.2 Create the Database and User

Run the following command in Terminal to create the `cardiosight` database and user credentials:

```bash
psql -U postgres -c "CREATE USER cardiosight WITH PASSWORD 'cardiosight' SUPERUSER;" 2>/dev/null || psql -c "CREATE USER cardiosight WITH PASSWORD 'cardiosight' SUPERUSER;"
psql -U postgres -c "CREATE DATABASE cardiosight OWNER cardiosight;" 2>/dev/null || psql -c "CREATE DATABASE cardiosight OWNER cardiosight;"
```

> **Note**: If your system asks for a password when connecting to PostgreSQL, enter the password you chose when you installed PostgreSQL (default is typically `postgres` or blank).

---

### 2.3 Initialize the Tables and Default Admin User

Now, enter the `Backend` directory, configure your environment file, create the tables, and seed the demo administrator:

```bash
cd Backend
cp .env.example .env
npm install
npm run db:init
npm run db:seed
```

#### What you will see when successful:
```text
Database schema applied successfully.
Admin ready: admin@cardiosight.local (password: Admin@12345)
```

> **Success!** Your database is now initialized with all necessary tables, clinical indices, and a pre-configured administrator account.

Return to the main project folder before proceeding:
```bash
cd ..
```

---

## STEP 3: Start the Machine Learning Service (Terminal Window 1)

This service loads the trained cardiovascular models and calculates mathematical SHAP explanations.

1. **Keep your current Terminal window** (we will call this **Terminal Window 1**).
2. Enter the `ML` directory:
   ```bash
   cd ML
   ```
3. Create an isolated Python virtual environment:
   ```bash
   python3 -m venv .venv
   ```
4. Activate the virtual environment:
   - **On macOS / Linux**:
     ```bash
     source .venv/bin/activate
     ```
   - **On Windows**:
     ```powershell
     .venv\Scripts\activate
     ```
   *(When active, you will see `(.venv)` appear at the beginning of your Terminal command line).*

5. Install the required machine learning packages:
   ```bash
   pip install -r requirements.txt
   ```
   *(This downloads Django, scikit-learn, pandas, numpy, and SHAP. It takes approximately 1 to 2 minutes).*

6. Start the Machine Learning server:
   ```bash
   python manage.py runserver 127.0.0.1:8000
   ```

#### What you will see when successful:
```text
Watching for file changes with StatReloader
Performing system checks...
System check identified no issues (0 silenced).
Starting development server at http://127.0.0.1:8000/
Quit the server with CONTROL-C.
```

> ⚠️ **IMPORTANT**: **Leave Terminal Window 1 OPEN.** Do not close this window. The Machine Learning service must remain running here.

---

## STEP 4: Start the Backend API Server (Terminal Window 2)

Now we will start the Node.js backend that handles authentication and report processing.

1. Open a **SECOND, NEW Terminal window** (`Command + N` on Mac or open a new PowerShell window on Windows).
2. Navigate to your CardioSight project folder:
   ```bash
   cd CardioSight/Backend
   ```
   *(If you unzipped the project in another location, navigate to that `Backend` folder).*
3. Start the backend gateway:
   ```bash
   npm start
   ```

#### What you will see when successful:
```text
CardioSight API listening on http://localhost:3000
```

> ⚠️ **IMPORTANT**: **Leave Terminal Window 2 OPEN.** Do not close this window.

---

## STEP 5: Start the Frontend Web Application (Terminal Window 3)

Now we will start the Angular user interface website.

1. Open a **THIRD, NEW Terminal window** (`Command + N` on Mac or a new PowerShell window on Windows).
2. Navigate to the `Frontend` folder:
   ```bash
   cd CardioSight/Frontend
   ```
3. Install frontend dependencies (only needed the very first time):
   ```bash
   npm install
   ```
   *(Takes approximately 1 to 2 minutes).*
4. Start the Angular web server:
   ```bash
   npm start
   ```

#### What you will see when successful:
```text
Application bundle generation complete.
** Angular Live Development Server is listening on localhost:4200, open your browser on http://localhost:4200/ **
✔ Compiled successfully.
```

> ⚠️ **IMPORTANT**: **Leave Terminal Window 3 OPEN.** Do not close this window.

---

## Quick Summary of Your 3 Active Terminal Windows

At this point, you have three Terminal windows running side by side:

| Window | Directory | Command Running | Purpose |
| :--- | :--- | :--- | :--- |
| **Window 1** | `CardioSight/ML` | `python manage.py runserver 127.0.0.1:8000` | Machine Learning & SHAP Service |
| **Window 2** | `CardioSight/Backend` | `npm start` | Express API Gateway & Database Controller |
| **Window 3** | `CardioSight/Frontend` | `npm start` | Angular Web Interface Server |

---

## STEP 6: Open CardioSight in Your Web Browser

1. Open **Google Chrome**, **Safari**, **Mozilla Firefox**, or **Microsoft Edge**.
2. In the web address bar at the top, type:
   ```text
   http://localhost:4200
   ```
3. Press **Enter**.
4. The CardioSight welcome and login screen will appear immediately.

---

## STEP 7: Step-by-Step Demonstration Walkthrough

Follow this guided tour to demonstrate all features of CardioSight during an examination or evaluation:

### A. Logging in
On the login screen, enter the pre-configured credentials:
- **Email**: `admin@cardiosight.local`
- **Password**: `Admin@12345`
- Click the blue **Sign In** button.

You are now in the **Cardiovascular Clinical Dashboard**. You will see:
- Overall Patient Health Score meter.
- Cardiac Risk Stratification distribution bar.
- Recent Clinical Assessments table.
- Clinical Advice & Quick-Start buttons.

---

### B. Running a Framingham CHD Assessment
1. Click the **"New Assessment"** button in the top navigation bar (or click *"Predict Risk"* in the sidebar).
2. The interactive 6-step clinical input form will appear:
   - **Step 1 (Personal)**: Set Age (e.g., `58`), Biological Sex (`Male`), Education Level.
   - Click **Next**.
   - **Step 2 (Lifestyle)**: Select Active Smoker (`Yes`), Cigarettes per day (`20`).
   - Click **Next**.
   - **Step 3 (Medical History)**: Check Hypertension (`Yes`), Diabetes (`No`), Prior Stroke (`No`).
   - Click **Next**.
   - **Step 4 (Clinical Measurements)**: Total Cholesterol (`245 mg/dL`), Systolic BP (`145 mmHg`), Diastolic BP (`92 mmHg`), BMI (`28.4 kg/m²`), Heart Rate (`76 bpm`), Blood Glucose (`105 mg/dL`).
   - Click **Next**.
   - **Step 5 (Investigations - ECG & TMT)**: You can leave this blank for now, or upload test reports (see sections D and E below).
   - Click **Next**.
   - **Step 6 (Review)**: Review the entered parameters and click **"Generate Comprehensive Risk Profile"**.

---

### C. Understanding the SHAP Explainable AI Results
Within milliseconds, the **Cardiovascular Risk Report** opens:

1. **Risk Score & Meter**: Displays the 10-year percentage probability of coronary heart disease (e.g., `71% High Risk`) with decision boundary confidence.
2. **Key Biometric Factors**: Shows which clinical indicators have the largest influence.
3. **Clinical Action Recommendations**: Tailored guidance (e.g., blood pressure monitoring, smoking cessation).
4. **Explainable AI (XAI) Section**:
   - **Mathematical Consistency Badge**: Shows a green verified badge confirming $P = \text{Baseline} + \sum \phi_i$.
   - **Personalized Clinical Insight**: Plain-English narrative explaining how the ensemble reached its conclusion.
   - **Top Risk-Increasing Contributors**: Displays red cards identifying the parameters that elevated risk above baseline (e.g., Cigarettes per day: +5.57%).
   - **Top Risk-Mitigating Contributors**: Displays green cards identifying protective factors.
   - **SHAP Waterfall Progression Chart**: An interactive bar chart illustrating step-by-step how each biomarker shifts probability from the model baseline prior (49.9%) to the final predicted score.
   - **Global Feature Importance Chart**: Compares overall dataset feature importance (Gini importance) against this individual patient's local attribution.

---

### D. Testing ECG Report PDF Analysis
CardioSight includes an automated PDF extraction pipeline that reads standard 12-lead electrocardiogram reports:

1. Go to **New Assessment** and proceed to **Step 5 (Investigations)**.
2. In the **ECG Report Analysis** card, click **Upload ECG Report (PDF)**.
3. Select the provided test file located in your project root folder:
   ```text
   CardioSight/test_ecg_report.pdf
   ```
4. Within 1 second, the automated parser extracts:
   - **Heart Rate**: `72 bpm`
   - **PR Interval**: `160 ms`
   - **QRS Duration**: `90 ms`
   - **QT / QTc Interval**: `380 ms / 410 ms`
   - **ST Segment**: `Normal`
   - **T-Wave**: `Normal`
   - **Diagnosis**: Extracted accurately with AHA/ACC normal thresholds applied.
5. You can edit any value manually if desired.
6. When you submit the assessment, the result page includes a dedicated **Section B: 12-Lead Electrocardiogram Interpretation** card with conduction interval analysis and PTB-XL diagnostic classification (`NORM`).

---

### E. Testing Treadmill Test (TMT) Stress Analysis
CardioSight also evaluates exercise-induced myocardial ischemia using the Duke Treadmill Score and a machine learning model trained on genuine UCI Cleveland Heart Disease data:

1. On **Step 5 (Investigations)** of the assessment form, locate the **TMT Exercise Stress Test** section.
2. Click **Upload TMT Report (PDF)**.
3. Select the provided test file located in your project root folder:
   ```text
   CardioSight/test_tmt_report.pdf
   ```
4. The parser instantly extracts:
   - **Peak Heart Rate achieved**: `155 bpm`
   - **Workload achieved**: `10.5 METs`
   - **Exercise Duration**: `9.0 minutes`
   - **ST depression (oldpeak)**: `1.2 mm`
   - **ST slope**: `Flat / Horizontal (Slope 2)`
   - **Exercise-induced angina**: `Negative (0)`
5. When you submit, the report displays:
   - **Duke Treadmill Score (DTS)**: Numerical score and risk category (`Moderate Risk`, annual cardiovascular mortality `~1.25%`).
   - **UCI Machine Learning Stress Model**: Probability of angiographic coronary artery disease with model confidence percentage.

---

### F. Viewing History and Downloading Clinical Reports
1. Click **History** in the top navigation bar.
2. View all previously evaluated patient assessments with sorting, search, and risk-level filtering.
3. Click any record to inspect its full findings.
4. On any result page, click **"Download JSON"** in the upper right corner to save a complete, portable clinical report for medical records.

---

## STEP 8: How to Safely Stop CardioSight

When you are finished demonstrating CardioSight and want to close the application:

1. Click on **Terminal Window 1** (ML Service) and press:
   `Control + C`
2. Click on **Terminal Window 2** (Backend Gateway) and press:
   `Control + C`
3. Click on **Terminal Window 3** (Frontend Web Server) and press:
   `Control + C`
4. Close your browser tabs and Terminal windows.

PostgreSQL can safely remain running as a background service on your computer, using negligible memory. If you wish to stop PostgreSQL on Mac:
```bash
brew services stop postgresql@16
```

---

## Troubleshooting Common Issues

### Issue 1: "Address already in use" or "Port 3000 / 8000 / 4200 is in use"
- **What it means**: A previous session of CardioSight was left running in the background.
- **How to fix it**:
  - On **Mac**: Open Terminal and run:
    ```bash
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    lsof -ti :8000 | xargs kill -9 2>/dev/null || true
    lsof -ti :4200 | xargs kill -9 2>/dev/null || true
    ```
  - Then restart the respective service.

### Issue 2: "Database connection failed" or "password authentication failed"
- **What it means**: The backend cannot connect to your PostgreSQL server.
- **How to fix it**:
  1. Verify PostgreSQL is started:
     ```bash
     brew services list   # On Mac
     ```
  2. Open `Backend/.env` in any text editor.
  3. Verify that `DATABASE_URL` matches your local username and password. For example:
     ```text
     DATABASE_URL=postgres://cardiosight:cardiosight@localhost:5432/cardiosight
     ```

### Issue 3: "Command not found: node" or "Command not found: python3"
- **What it means**: Node.js or Python is not installed, or your Terminal path needs to be refreshed.
- **How to fix it**:
  - Close your Terminal and open a fresh Terminal window.
  - If still missing, install the tool from [nodejs.org](https://nodejs.org/) or [python.org](https://www.python.org/).

### Issue 4: "SHAP Explainable AI shows Retry Explanation"
- **What it means**: The Django machine learning service was not running when the page loaded.
- **How to fix it**:
  - Look at **Terminal Window 1** to ensure `python manage.py runserver` is active.
  - Click the **"Retry Explanation"** button on the results page. The SHAP waterfall chart and feature attributions will load immediately.

---

## Need Further Help?

If you encounter an unexpected system message during evaluation, note down the text from the Terminal window and provide it to the student author:

- **Student Author**: Utkarsh Sood
- **Project**: CardioSight Academic Capstone Evaluation
