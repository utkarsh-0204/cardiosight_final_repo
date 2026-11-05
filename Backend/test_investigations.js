// =============================================================================
// Comprehensive Test Suite for CardioSight Optional ECG & TMT Investigation System
// =============================================================================
const http = require('http');
const fs = require('fs');
const path = require('path');

let TOKEN = '';

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      if (Buffer.isBuffer(postData)) {
        req.write(postData);
      } else {
        req.write(postData);
      }
    }
    req.end();
  });
}

// Generate simple valid PDF buffer containing text
function createSimplePdf(textContent) {
  // Minimal valid PDF structure (1.4)
  const lines = textContent.split('\n').filter(l => l.trim().length > 0);
  const streamLines = lines.map((l, i) => {
    const escaped = l.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    return i === 0 ? `50 750 Td (${escaped}) Tj` : `T* (${escaped}) Tj`;
  });
  const streamContent = `BT /F1 12 Tf 14 TL ${streamLines.join(' ')} ET`;
  const streamLength = Buffer.byteLength(streamContent);

  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${streamLength} >>
stream
${streamContent}
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000340 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
427
%%EOF`;
  return Buffer.from(pdf, 'utf-8');
}

// Multi-part form-data helper
function buildMultipart(filename, fileBuffer) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, fileBuffer, footer]);
  return { boundary, body };
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING CARDIOSIGHT ECG & TMT TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      failed++;
    }
  }

  // Authenticate patient to acquire a valid clinical JWT token
  const jwt = require('jsonwebtoken');
  const utkarshId = '2c9eade5-67b9-4fd7-b716-b7f7dc54b61f';
  TOKEN = jwt.sign({ sub: utkarshId, role: 'patient' }, process.env.JWT_SECRET || 'cardiosight_secure_jwt_local_secret_key_2026', { expiresIn: '7d' });
  console.log('[SETUP] Patient authenticated with valid JWT token.\n');

  // TEST 1: Regression Test - Standard Framingham 15 parameters without ECG/TMT
  console.log('--- TEST GROUP 1: FRAMINGHAM REGRESSION ---');
  const standardInput = {
    male: 1,
    age: 55,
    education: 2,
    currentSmoker: 1,
    cigsPerDay: 20,
    BPMeds: 0,
    prevalentStroke: 0,
    prevalentHyp: 1,
    diabetes: 0,
    totChol: 240,
    sysBP: 145,
    diaBP: 90,
    BMI: 28.5,
    heartRate: 78,
    glucose: 95,
  };

  const res1 = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    JSON.stringify(standardInput)
  );

  assert(res1.status === 201 && res1.body.success, 'Standard 15-parameter Framingham prediction succeeds without ECG/TMT');
  assert(res1.body.data.riskScore > 0, 'Risk score is computed and non-zero');
  assert(res1.body.data.ecg === null, 'ECG field is null when omitted');
  assert(res1.body.data.tmt === null, 'TMT field is null when omitted');
  const predictionId1 = res1.body.data?.id;

  // TEST 2: Prediction with manual ECG measurements
  console.log('\n--- TEST GROUP 2: PREDICTION WITH ECG DATA ---');
  const inputWithEcg = {
    ...standardInput,
    ecg: {
      heartRate: 82,
      prInterval: 170,
      qrsDuration: 94,
      qtInterval: 410,
      qtcInterval: 440,
      stFindings: 'ST Depression',
      tWaveFindings: 'T-Wave Inversion',
      rhythm: 'Sinus Tachycardia',
      interpretation: 'Borderline ST-T changes indicative of lateral ischemia',
    },
  };

  const res2 = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    JSON.stringify(inputWithEcg)
  );

  assert(res2.status === 201 && res2.body.data.ecg !== null, 'Prediction with optional ECG persists successfully');
  assert(res2.body.data.ecg.status === 'abnormal', 'ECG evaluator identified abnormal status due to ST depression / T-inversion');
  assert(res2.body.data.ecg.abnormalities.length > 0, 'Flagged specific abnormalities in ECG payload');

  // TEST 3: Prediction with manual TMT measurements
  console.log('\n--- TEST GROUP 3: PREDICTION WITH TMT DATA ---');
  const inputWithTmt = {
    ...standardInput,
    tmt: {
      exang: 1,
      oldpeak: 2.2,
      slope: 2,
      thalach: 142,
      restingHR: 76,
      restecg: 1,
      mets: 7.5,
      durationMinutes: 6.5,
      reportedConclusion: 'Positive for inducible myocardial ischemia at Stage 2',
    },
  };

  const res3 = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    JSON.stringify(inputWithTmt)
  );

  assert(res3.status === 201 && res3.body.data.tmt !== null, 'Prediction with optional TMT persists successfully');
  assert(res3.body.data.tmt.dukeTreadmillScore !== null, 'Duke Treadmill Score is computed');
  assert(res3.body.data.tmt.dukeTreadmillScore.riskCategory === 'Moderate Risk' || res3.body.data.tmt.dukeTreadmillScore.riskCategory === 'High Risk', 'Duke Treadmill Score stratified risk correctly');
  assert(res3.body.data.tmt.mlUciStressModel !== null, 'UCI Machine Learning Model executed on TMT parameters');
  assert(res3.body.data.tmt.mlUciStressModel.confidence > 0, 'UCI ML Model returned confidence score');

  // TEST 4: Prediction with BOTH ECG and TMT investigations
  console.log('\n--- TEST GROUP 4: PREDICTION WITH BOTH ECG AND TMT ---');
  const inputWithBoth = {
    ...standardInput,
    ecg: inputWithEcg.ecg,
    tmt: inputWithTmt.tmt,
  };

  const res4 = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    JSON.stringify(inputWithBoth)
  );

  assert(res4.status === 201 && res4.body.data.ecg && res4.body.data.tmt, 'Prediction with both ECG and TMT returned and serialized');
  const predictionId4 = res4.body.data.id;

  // TEST 5: GET Prediction by ID verifies persistence of both investigations
  console.log('\n--- TEST GROUP 5: GET /api/predict/:id PERSISTENCE VERIFICATION ---');
  const resGet = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/predict/${predictionId4}`,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });

  assert(resGet.status === 200 && resGet.body.success, 'GET /api/predict/:id retrieves saved record');
  assert(resGet.body.data.ecg !== null, 'Persisted ECG retrieved successfully');
  assert(resGet.body.data.tmt !== null, 'Persisted TMT retrieved successfully');
  assert(resGet.body.data.ecg.measurements.heartRate === 82, 'ECG measurements intact');
  assert(resGet.body.data.tmt.measurements.thalach === 142, 'TMT measurements intact');

  // TEST 6: PDF Extraction for ECG report
  console.log('\n--- TEST GROUP 6: PDF EXTRACTION FOR ECG REPORT ---');
  const sampleEcgText = `
CLINICAL 12-LEAD ELECTROCARDIOGRAM REPORT
Patient Name: Test Patient    Age: 55    Sex: M
Heart Rate: 78 bpm
PR Interval: 160 ms
QRS Duration: 88 ms
QT Interval: 390 ms
QTc Interval: 444 ms
Rhythm: Normal Sinus Rhythm
Findings: Non-specific ST changes in leads V4-V6.
Interpretation: Normal sinus rhythm with normal axis and PR interval.
`;
  const ecgPdfBuffer = createSimplePdf(sampleEcgText);
  const multipartEcg = buildMultipart('patient_ecg_report.pdf', ecgPdfBuffer);

  const resEcgPdf = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-ecg',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartEcg.boundary}`,
        'Content-Length': multipartEcg.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartEcg.body
  );

  assert(resEcgPdf.status === 200 && resEcgPdf.body.success, 'POST /api/investigations/parse-ecg parsed valid PDF');
  assert(resEcgPdf.body.fields.heartRate.value === 78, 'Extracted Heart Rate = 78 bpm');
  assert(resEcgPdf.body.fields.prInterval.value === 160, 'Extracted PR Interval = 160 ms');
  assert(resEcgPdf.body.fields.qrsDuration.value === 88, 'Extracted QRS Duration = 88 ms');
  assert(resEcgPdf.body.fields.qtcInterval.value === 444, 'Extracted QTc Interval = 444 ms');

  // TEST 7: PDF Extraction for TMT exercise stress report
  console.log('\n--- TEST GROUP 7: PDF EXTRACTION FOR TMT REPORT ---');
  const sampleTmtText = `
CARDIAC STRESS TESTING REPORT - BRUCE TREADMILL PROTOCOL
Maximum Heart Rate Achieved: 154 bpm (88% of age-predicted maximum)
Resting Heart Rate: 72 bpm
ST Depression: 1.8 mm horizontal ST depression in inferior leads
ST Slope: Horizontal / Flat
Exercise Angina: Negative
Total Exercise Duration: 8.5 minutes
Workload: 10.2 METs
Conclusion: Equivocal exercise stress test at 88% MPHR with 1.8mm ST depression.
`;
  const tmtPdfBuffer = createSimplePdf(sampleTmtText);
  const multipartTmt = buildMultipart('patient_tmt_report.pdf', tmtPdfBuffer);

  const resTmtPdf = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-tmt',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartTmt.boundary}`,
        'Content-Length': multipartTmt.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartTmt.body
  );

  assert(resTmtPdf.status === 200 && resTmtPdf.body.success, 'POST /api/investigations/parse-tmt parsed valid PDF');
  assert(resTmtPdf.body.fields.thalach.value === 154, 'Extracted Peak HR = 154 bpm');
  assert(resTmtPdf.body.fields.oldpeak.value === 1.8, 'Extracted ST Depression = 1.8 mm');
  assert(resTmtPdf.body.fields.mets.value === 10.2, 'Extracted METs = 10.2');
  assert(resTmtPdf.body.fields.durationMinutes.value === 8.5, 'Extracted Duration = 8.5 min');
  assert(resTmtPdf.body.fields.exang.value === 0, 'Extracted Exercise Angina = 0 (Negative)');

  // TEST 8: Invalid / Corrupted File Handling
  console.log('\n--- TEST GROUP 8: CORRUPTED & INVALID FILE HANDLING ---');
  const fakePdfBuffer = Buffer.from('NOT A PDF FILE AT ALL - JUST PLAIN TEXT', 'utf-8');
  const multipartFake = buildMultipart('malicious.pdf', fakePdfBuffer);

  const resFakePdf = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-ecg',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartFake.boundary}`,
        'Content-Length': multipartFake.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartFake.body
  );

  assert(resFakePdf.status === 400 && !resFakePdf.body.success, 'Rejects fake non-PDF file using magic byte verification');

  // TEST 9: Unauthorized access rejection
  console.log('\n--- TEST GROUP 9: SECURITY & AUTHORIZATION ---');
  const resUnauth = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/predict/${predictionId1}`,
    method: 'GET',
  });
  assert(resUnauth.status === 401, 'Rejects unauthorized requests without JWT token');

  // TEST 10: Blank Template Test - CardioSight_ECG_Report.pdf
  console.log('\n--- TEST GROUP 10: REAL TEST FILE (CardioSight_ECG_Report.pdf) ---');
  const realEcgPath = '/Users/utkarshsood/Downloads/CardioSight_ECG_Report.pdf';
  if (fs.existsSync(realEcgPath)) {
    const realEcgBuffer = fs.readFileSync(realEcgPath);
    const multipartRealEcg = buildMultipart('CardioSight_ECG_Report.pdf', realEcgBuffer);
    const resRealEcg = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/investigations/parse-ecg',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${multipartRealEcg.boundary}`,
          'Content-Length': multipartRealEcg.body.length,
          Authorization: `Bearer ${TOKEN}`,
        },
      },
      multipartRealEcg.body
    );

    assert(resRealEcg.status === 200 && resRealEcg.body.success, 'CardioSight_ECG_Report.pdf processed successfully');
    assert(resRealEcg.body.extractionStatus === 'empty', 'Recognized blank template as extractionStatus: "empty"');
    assert(resRealEcg.body.fields.heartRate.value === null, 'Heart Rate is null (NEVER 0)');
    assert(resRealEcg.body.fields.prInterval.value === null, 'PR Interval is null');
    assert(resRealEcg.body.fields.qrsDuration.value === null, 'QRS Duration is null');
    assert(resRealEcg.body.fields.qtInterval.value === null, 'QT Interval is null');
    assert(resRealEcg.body.fields.qtcInterval.value === null, 'QTc Interval is null');
    assert(resRealEcg.body.fields.stFindings.value === null, 'ST Findings is null (NOT defaulted to Normal)');
    assert(resRealEcg.body.fields.tWaveFindings.value === null, 'T Wave Findings is null (NOT defaulted to Normal)');
    assert(resRealEcg.body.reportedDiagnosis === null, 'Reported Diagnosis is null');
    assert(resRealEcg.body.warnings.some(w => /unpopulated template/i.test(w)), 'Emits clear warning identifying unpopulated template');
  } else {
    console.warn('[SKIP] CardioSight_ECG_Report.pdf not found at ' + realEcgPath);
  }

  // TEST 11: Blank Template Test - CardioSight_TMT_Report.pdf
  console.log('\n--- TEST GROUP 11: REAL TEST FILE (CardioSight_TMT_Report.pdf) ---');
  const realTmtPath = '/Users/utkarshsood/Downloads/CardioSight_TMT_Report.pdf';
  if (fs.existsSync(realTmtPath)) {
    const realTmtBuffer = fs.readFileSync(realTmtPath);
    const multipartRealTmt = buildMultipart('CardioSight_TMT_Report.pdf', realTmtBuffer);
    const resRealTmt = await request(
      {
        hostname: 'localhost',
        port: 3000,
        path: '/api/investigations/parse-tmt',
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${multipartRealTmt.boundary}`,
          'Content-Length': multipartRealTmt.body.length,
          Authorization: `Bearer ${TOKEN}`,
        },
      },
      multipartRealTmt.body
    );

    assert(resRealTmt.status === 200 && resRealTmt.body.success, 'CardioSight_TMT_Report.pdf processed successfully');
    assert(resRealTmt.body.extractionStatus === 'empty', 'Recognized blank template as extractionStatus: "empty"');
    assert(resRealTmt.body.fields.thalach.value === null, 'Peak HR is null (NEVER 0)');
    assert(resRealTmt.body.fields.oldpeak.value === null, 'ST depression is null');
    assert(resRealTmt.body.fields.mets.value === null, 'METs is null');
    assert(resRealTmt.body.fields.durationMinutes.value === null, 'Duration is null');
    assert(resRealTmt.body.fields.exang.value === null, 'Exang is null (NOT defaulted to 0)');
    assert(resRealTmt.body.fields.slope.value === null, 'Slope is null');
    assert(resRealTmt.body.fields.restecg.value === null, 'Restecg is null (NOT defaulted to 0)');
    assert(resRealTmt.body.reportedConclusion === null, 'Reported Conclusion is null');
    assert(resRealTmt.body.warnings.some(w => /unpopulated template/i.test(w)), 'Emits clear warning identifying unpopulated template');
  } else {
    console.warn('[SKIP] CardioSight_TMT_Report.pdf not found at ' + realTmtPath);
  }

  // TEST 12: Synthetic Clinical ECG Report with Varied Clinical Formatting
  console.log('\n--- TEST GROUP 12: SYNTHETIC CLINICAL ECG WITH KNOWN VALUES ---');
  const synthEcgText = `
CLINICAL 12-LEAD ELECTROCARDIOGRAM REPORT
Vent. Rate: 76 bpm
PR interval (ms): 158
QRS duration: 88 ms
QT/QTc: 390/424 ms
ST-segment findings: ST Depression
T-Wave: T-Wave Inversion
Cardiac Rhythm: Sinus Tachycardia
Interpretation: Sinus tachycardia with inferolateral ST depression and T-wave inversion.
`;
  const synthEcgPdf = createSimplePdf(synthEcgText);
  const multipartSynthEcg = buildMultipart('clinical_ecg.pdf', synthEcgPdf);
  const resSynthEcg = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-ecg',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartSynthEcg.boundary}`,
        'Content-Length': multipartSynthEcg.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartSynthEcg.body
  );

  assert(resSynthEcg.status === 200 && resSynthEcg.body.success, 'Synthetic ECG report processed successfully');
  assert(resSynthEcg.body.extractionStatus === 'success', 'Extraction status is "success"');
  assert(resSynthEcg.body.fields.heartRate.value === 76, 'Extracted Vent. Rate = 76 bpm');
  assert(resSynthEcg.body.fields.prInterval.value === 158, 'Extracted PR interval = 158 ms');
  assert(resSynthEcg.body.fields.qrsDuration.value === 88, 'Extracted QRS duration = 88 ms');
  assert(resSynthEcg.body.fields.qtInterval.value === 390, 'Extracted QT = 390 ms from combo format');
  assert(resSynthEcg.body.fields.qtcInterval.value === 424, 'Extracted QTc = 424 ms from combo format');
  assert(resSynthEcg.body.fields.stFindings.value === 'ST Depression', 'Extracted ST Depression');
  assert(resSynthEcg.body.fields.tWaveFindings.value === 'T-Wave Inversion', 'Extracted T-Wave Inversion');
  assert(resSynthEcg.body.fields.rhythm.value === 'Sinus Tachycardia', 'Extracted Sinus Tachycardia');
  assert(resSynthEcg.body.reportedDiagnosis.includes('inferolateral ST depression'), 'Extracted clinical diagnosis');

  // TEST 13: Synthetic Clinical TMT Report with Varied Stress Formats
  console.log('\n--- TEST GROUP 13: SYNTHETIC CLINICAL TMT WITH KNOWN VALUES ---');
  const synthTmtText = `
TREADMILL EXERCISE STRESS REPORT - BRUCE PROTOCOL
Maximum heart rate achieved (bpm): 156
Resting heart rate: 70 bpm
Target HR achieved: 90%
ST depression (oldpeak, mm): 1.5
Peak ST-segment slope: 2 - Flat / Horizontal
Exercise-induced angina: Yes, limiting angina at stage 3
Exercise duration (minutes): 08:30
Workload: 10.5 METs
Resting ECG finding: Normal
Reported exercise conclusion / diagnosis: Positive treadmill stress test with 1.5mm flat ST depression.
`;
  const synthTmtPdf = createSimplePdf(synthTmtText);
  const multipartSynthTmt = buildMultipart('clinical_tmt.pdf', synthTmtPdf);
  const resSynthTmt = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-tmt',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartSynthTmt.boundary}`,
        'Content-Length': multipartSynthTmt.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartSynthTmt.body
  );

  assert(resSynthTmt.status === 200 && resSynthTmt.body.success, 'Synthetic TMT report processed successfully');
  assert(resSynthTmt.body.extractionStatus === 'success', 'Extraction status is "success"');
  assert(resSynthTmt.body.fields.thalach.value === 156, 'Extracted Max HR Achieved = 156 bpm');
  assert(resSynthTmt.body.fields.restingHR.value === 70, 'Extracted Resting HR = 70 bpm');
  assert(resSynthTmt.body.fields.targetHrPercent.value === 90, 'Extracted Target HR = 90%');
  assert(resSynthTmt.body.fields.oldpeak.value === 1.5, 'Extracted ST depression = 1.5 mm');
  assert(resSynthTmt.body.fields.slope.value === 2, 'Extracted ST slope = 2 (Flat / Horizontal)');
  assert(resSynthTmt.body.fields.exang.value === 1, 'Extracted Exercise Angina = 1 (Yes)');
  assert(resSynthTmt.body.fields.durationMinutes.value === 8.5, 'Extracted Duration = 8.5 min (converted from 08:30)');
  assert(resSynthTmt.body.fields.mets.value === 10.5, 'Extracted Workload = 10.5 METs');
  assert(resSynthTmt.body.fields.restecg.value === 0, 'Extracted Resting ECG = 0 (Normal)');
  assert(resSynthTmt.body.reportedConclusion.includes('Positive treadmill stress test'), 'Extracted reported conclusion');

  // TEST 14: Missing-Value Safety Evaluator
  console.log('\n--- TEST GROUP 14: MISSING-VALUE SAFETY EVALUATION ---');
  const ecgService = require('./services/ecgService');
  const evalEmpty = ecgService.evaluateEcgFindings({});
  assert(evalEmpty.status === 'indeterminate', 'Empty ECG input is classified as "indeterminate" (NEVER "normal")');
  assert(evalEmpty.measurements.heartRate === null, 'Heart rate is null (NEVER 0)');
  assert(evalEmpty.measurements.stFindings === null, 'ST findings is null (NEVER defaulted to Normal)');
  assert(evalEmpty.measurements.tWaveFindings === null, 'T wave findings is null (NEVER defaulted to Normal)');
  assert(evalEmpty.rhythm === null, 'Rhythm is null (NEVER defaulted to Normal Sinus)');
  assert(evalEmpty.ptbxlDiagnosticClass === 'INDETERMINATE', 'Diagnostic class is INDETERMINATE');

  // TEST 15: Scanned / Image-based PDF Detection
  console.log('\n--- TEST GROUP 15: SCANNED / RASTER PDF DETECTION ---');
  const scannedPdf = createSimplePdf('   ');
  const multipartScanned = buildMultipart('scanned_ecg.pdf', scannedPdf);
  const resScanned = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-ecg',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartScanned.boundary}`,
        'Content-Length': multipartScanned.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartScanned.body
  );

  assert(resScanned.status === 200 && resScanned.body.isScanned === true, 'Detected scanned/empty raster PDF as isScanned: true');
  assert(resScanned.body.warnings.some(w => /scanned|image-based/i.test(w)), 'Emits clear warning that OCR is unavailable or document is scanned');

  // TEST 16: User-Specified Synthetic File - test_ecg_report.pdf
  console.log('\n--- TEST GROUP 16: USER TEST FILE (test_ecg_report.pdf) ---');
  const userEcgPath = path.join(__dirname, '..', 'test_ecg_report.pdf');
  const userEcgBuffer = fs.readFileSync(userEcgPath);
  const multipartUserEcg = buildMultipart('test_ecg_report.pdf', userEcgBuffer);
  const resUserEcg = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-ecg',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartUserEcg.boundary}`,
        'Content-Length': multipartUserEcg.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartUserEcg.body
  );

  assert(resUserEcg.status === 200 && resUserEcg.body.success, 'POST /api/investigations/parse-ecg parsed test_ecg_report.pdf successfully');
  assert(resUserEcg.body.extractionStatus === 'success', 'ECG extraction status is "success"');
  assert(resUserEcg.body.fields.heartRate.value === 72, '1. Heart rate = 72 bpm');
  assert(resUserEcg.body.fields.prInterval.value === 160, '2. PR interval = 160 ms');
  assert(resUserEcg.body.fields.qrsDuration.value === 90, '3. QRS duration = 90 ms');
  assert(resUserEcg.body.fields.qtInterval.value === 380, '4. QT interval = 380 ms');
  assert(resUserEcg.body.fields.qtcInterval.value === 410, '5. QTc interval = 410 ms');
  assert(resUserEcg.body.fields.stFindings.value === 'Normal', '6. ST-segment findings = Normal isoelectric ST');
  assert(resUserEcg.body.fields.tWaveFindings.value === 'Normal', '7. T-wave findings = Normal upright T-wave');
  assert(resUserEcg.body.reportedDiagnosis === 'Synthetic ECG extraction test report. No real patient data.', '8. Written report diagnosis / interpretation extracted accurately');

  // TEST 17: User-Specified Synthetic File - test_tmt_report.pdf
  console.log('\n--- TEST GROUP 17: USER TEST FILE (test_tmt_report.pdf) ---');
  const userTmtPath = path.join(__dirname, '..', 'test_tmt_report.pdf');
  const userTmtBuffer = fs.readFileSync(userTmtPath);
  const multipartUserTmt = buildMultipart('test_tmt_report.pdf', userTmtBuffer);
  const resUserTmt = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/investigations/parse-tmt',
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${multipartUserTmt.boundary}`,
        'Content-Length': multipartUserTmt.body.length,
        Authorization: `Bearer ${TOKEN}`,
      },
    },
    multipartUserTmt.body
  );

  assert(resUserTmt.status === 200 && resUserTmt.body.success, 'POST /api/investigations/parse-tmt parsed test_tmt_report.pdf successfully');
  assert(resUserTmt.body.extractionStatus === 'success', 'TMT extraction status is "success"');
  assert(resUserTmt.body.fields.exang.value === 0, '1. Exercise-induced angina = 0 (No)');
  assert(resUserTmt.body.fields.oldpeak.value === 1.2, '2. ST depression (oldpeak) = 1.2 mm');
  assert(resUserTmt.body.fields.slope.value === 2, '3. Peak ST segment slope = 2 (Flat)');
  assert(resUserTmt.body.fields.thalach.value === 155, '4. Maximum heart rate achieved = 155 bpm');
  assert(resUserTmt.body.fields.restecg.value === 0, '5. Resting ECG finding = 0 (Normal)');
  assert(resUserTmt.body.fields.mets.value === 10.5, '6. METs achieved = 10.5');
  assert(resUserTmt.body.fields.durationMinutes.value === 9, '7. Exercise duration = 9 minutes');
  assert(resUserTmt.body.reportedConclusion === 'Synthetic TMT extraction test report. No real patient data.', '8. Reported exercise conclusion / diagnosis extracted accurately');

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');
  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  process.exit(1);
});
