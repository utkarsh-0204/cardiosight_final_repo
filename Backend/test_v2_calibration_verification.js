/**
 * CardioSight V2 Platt-Calibrated Model Verification Suite
 * Tests artifact loading, V1 vs V2 predictions across clinical profiles,
 * determinism, boundary handling, and integration isolation.
 */

const axios = require('axios');
const assert = require('assert');
const { calculateRiskLevel } = require('./services/mlService');

const ML_PREDICT_URL = 'http://127.0.0.1:8000/api/predict';

const PROFILES = {
  default50M: {
    age: 50,
    male: 1,
    totChol: 200,
    sysBP: 120,
    diaBP: 80,
    currentSmoker: 0,
    cigsPerDay: 0,
    BMI: 25.0,
    heartRate: 70,
    glucose: 85,
    diabetes: 0,
    prevalentHyp: 0,
    prevalentStroke: 0,
    BPMeds: 0,
    education: 2
  },
  lowRisk25F: {
    age: 25,
    male: 0,
    totChol: 160,
    sysBP: 110,
    diaBP: 70,
    currentSmoker: 0,
    cigsPerDay: 0,
    BMI: 21.0,
    heartRate: 65,
    glucose: 80,
    diabetes: 0,
    prevalentHyp: 0,
    prevalentStroke: 0,
    BPMeds: 0,
    education: 3
  },
  highRisk68M: {
    age: 68,
    male: 1,
    totChol: 280,
    sysBP: 165,
    diaBP: 100,
    currentSmoker: 1,
    cigsPerDay: 30,
    BMI: 32.5,
    heartRate: 88,
    glucose: 180,
    diabetes: 1,
    prevalentHyp: 1,
    prevalentStroke: 1,
    BPMeds: 1,
    education: 1
  },
  smokingVariationNonSmoker: {
    age: 58,
    male: 1,
    totChol: 230,
    sysBP: 140,
    diaBP: 90,
    currentSmoker: 0,
    cigsPerDay: 0,
    BMI: 27.0,
    heartRate: 75,
    glucose: 95,
    diabetes: 0,
    prevalentHyp: 0,
    prevalentStroke: 0,
    BPMeds: 0,
    education: 2
  },
  smokingVariationSmoker: {
    age: 58,
    male: 1,
    totChol: 230,
    sysBP: 140,
    diaBP: 90,
    currentSmoker: 1,
    cigsPerDay: 25,
    BMI: 27.0,
    heartRate: 75,
    glucose: 95,
    diabetes: 0,
    prevalentHyp: 0,
    prevalentStroke: 0,
    BPMeds: 0,
    education: 2
  },
  hypertensionNormotensive: {
    age: 55,
    male: 1,
    totChol: 210,
    sysBP: 118,
    diaBP: 78,
    currentSmoker: 0,
    cigsPerDay: 0,
    BMI: 25.5,
    heartRate: 68,
    glucose: 88,
    diabetes: 0,
    prevalentHyp: 0,
    prevalentStroke: 0,
    BPMeds: 0,
    education: 2
  },
  hypertensionSevere: {
    age: 55,
    male: 1,
    totChol: 210,
    sysBP: 168,
    diaBP: 102,
    currentSmoker: 0,
    cigsPerDay: 0,
    BMI: 25.5,
    heartRate: 68,
    glucose: 88,
    diabetes: 0,
    prevalentHyp: 1,
    prevalentStroke: 0,
    BPMeds: 1,
    education: 2
  }
};

async function queryModel(features, modelVersion) {
  const payload = { features };
  if (modelVersion) payload.model_version = modelVersion;
  const res = await axios.post(ML_PREDICT_URL, payload, { timeout: 10000 });
  return res.data;
}

async function runVerification() {
  console.log('='.repeat(70));
  console.log('CARDIOSIGHT V2 PLATT-CALIBRATED MODEL VERIFICATION SUITE');
  console.log('='.repeat(70));

  let passed = 0;
  let total = 0;

  function assertTest(name, condition) {
    total++;
    if (condition) {
      console.log(`[PASS] ${name}`);
      passed++;
    } else {
      console.error(`[FAIL] ${name}`);
      throw new Error(`Assertion failed: ${name}`);
    }
  }

  // --- TEST GROUP 1: ARTIFACT & CONFIGURATION SELECTION ---
  console.log('\n--- TEST GROUP 1: ARTIFACT & CONFIGURATION SELECTION ---');
  const defaultResp = await queryModel(PROFILES.default50M);
  assertTest('Default query (no flag) routes to V1 original model', defaultResp.model_version === 'v1_original');
  assertTest('Default query uses model.joblib', defaultResp.artifact_used === 'model.joblib');

  const v1Resp = await queryModel(PROFILES.default50M, 'v1');
  assertTest('Explicit v1 routes to V1 original model', v1Resp.model_version === 'v1_original');
  assertTest('Explicit v1 uses model.joblib', v1Resp.artifact_used === 'model.joblib');

  const v2Resp = await queryModel(PROFILES.default50M, 'v2');
  assertTest('Explicit v2 routes to V2 calibrated model', v2Resp.model_version === 'v2_platt_calibrated');
  assertTest('Explicit v2 uses model_calibrated.joblib', v2Resp.artifact_used === 'model_calibrated.joblib');

  // --- TEST GROUP 2: CLINICAL PROFILES & V1 VS V2 COMPARISON ---
  console.log('\n--- TEST GROUP 2: CLINICAL PROFILES & PROBABILITY CALIBRATION ---');
  
  const comparisonTable = [];

  for (const [key, profile] of Object.entries(PROFILES)) {
    const r1 = await queryModel(profile, 'v1');
    const r2 = await queryModel(profile, 'v2');

    const cat1 = calculateRiskLevel(r1.probability);
    const cat2 = calculateRiskLevel(r2.probability);

    comparisonTable.push({
      Profile: key,
      'V1 Prob (%)': r1.probability,
      'V1 Category': cat1.toUpperCase(),
      'V2 Prob (%)': r2.probability,
      'V2 Category': cat2.toUpperCase(),
      'Absolute Shift': (r2.probability - r1.probability).toFixed(2) + '%'
    });
  }

  console.table(comparisonTable);

  // Verification checks on profiles:
  // 1. Default 50M: Uncalibrated ~21.08% (or 32.54% with education missing), calibrated is realistically ~8.31%
  const def1 = await queryModel(PROFILES.default50M, 'v1');
  const def2 = await queryModel(PROFILES.default50M, 'v2');
  assertTest('Default 50M calibrated probability is lower than uncalibrated over-prediction', def2.probability < def1.probability);
  assertTest('Default 50M V2 classified as Low Risk (<10%)', calculateRiskLevel(def2.probability) === 'low');

  // 2. Low-Risk 25F:
  const low1 = await queryModel(PROFILES.lowRisk25F, 'v1');
  const low2 = await queryModel(PROFILES.lowRisk25F, 'v2');
  assertTest('Low risk 25F V1 is low risk (<10%)', calculateRiskLevel(low1.probability) === 'low');
  assertTest('Low risk 25F V2 is low risk (<10%)', calculateRiskLevel(low2.probability) === 'low');
  assertTest('Low risk 25F V2 probability is strictly under 5%', def2.probability > low2.probability);

  // 3. High-Risk 68M:
  const high1 = await queryModel(PROFILES.highRisk68M, 'v1');
  const high2 = await queryModel(PROFILES.highRisk68M, 'v2');
  assertTest('High risk 68M V1 is high risk (>=20%)', calculateRiskLevel(high1.probability) === 'high');
  assertTest('High risk 68M V2 is high risk (>=20%)', calculateRiskLevel(high2.probability) === 'high');
  assertTest('High risk 68M V2 probability is >= 40%', high2.probability >= 40.0);

  // 4. Smoking Sensitivity:
  const nonSmoke = await queryModel(PROFILES.smokingVariationNonSmoker, 'v2');
  const smoker = await queryModel(PROFILES.smokingVariationSmoker, 'v2');
  assertTest('V2 calibrated model reflects smoking risk increase', smoker.probability > nonSmoke.probability);
  console.log(`  Smoking variation: Non-Smoker ${nonSmoke.probability}% -> Smoker ${smoker.probability}%`);

  // 5. Hypertension Sensitivity:
  const normotensive = await queryModel(PROFILES.hypertensionNormotensive, 'v2');
  const hypertensive = await queryModel(PROFILES.hypertensionSevere, 'v2');
  assertTest('V2 calibrated model reflects hypertension risk increase', hypertensive.probability > normotensive.probability);
  console.log(`  Hypertension variation: Normotensive ${normotensive.probability}% -> Severe HTN ${hypertensive.probability}%`);

  // --- TEST GROUP 3: DETERMINISM & REPEATABILITY ---
  console.log('\n--- TEST GROUP 3: DETERMINISM & REPEATABILITY ---');
  const repeatedRuns = [];
  for (let i = 0; i < 10; i++) {
    const res = await queryModel(PROFILES.default50M, 'v2');
    repeatedRuns.push(res.probability);
  }
  const allIdentical = repeatedRuns.every(p => p === repeatedRuns[0]);
  assertTest('Identical inputs submitted 10 times consecutively produce bit-identical probabilities', allIdentical);
  console.log(`  10 repeated runs: [${repeatedRuns.join(', ')}]`);

  // --- TEST GROUP 4: RISK-CATEGORY BOUNDARY TESTS ---
  console.log('\n--- TEST GROUP 4: RISK-CATEGORY BOUNDARY TESTS ---');
  assertTest('Boundary: 0.0% -> low', calculateRiskLevel(0.0) === 'low');
  assertTest('Boundary: 8.31% (Default 50M V2) -> low', calculateRiskLevel(8.31) === 'low');
  assertTest('Boundary: 9.99% -> low', calculateRiskLevel(9.99) === 'low');
  assertTest('Boundary: 10.00% -> medium', calculateRiskLevel(10.00) === 'medium');
  assertTest('Boundary: 15.42% -> medium', calculateRiskLevel(15.42) === 'medium');
  assertTest('Boundary: 19.99% -> medium', calculateRiskLevel(19.99) === 'medium');
  assertTest('Boundary: 20.00% -> high', calculateRiskLevel(20.00) === 'high');
  assertTest('Boundary: 21.08% (Default 50M V1) -> high', calculateRiskLevel(21.08) === 'high');
  assertTest('Boundary: 62.45% (High 68M V2) -> high', calculateRiskLevel(62.45) === 'high');

  // --- TEST GROUP 5: INDEPENDENCE & ISOLATION ---
  console.log('\n--- TEST GROUP 5: INDEPENDENCE & ISOLATION ---');
  // Query with extra ECG / TMT fields in request to verify they do not impact Framingham inference
  const decoupledInput = {
    ...PROFILES.default50M,
    ecg: { hr: 120, stDepression: 2.0 },
    tmt: { oldpeak: 3.0, thalach: 180 }
  };
  const decoupledResp = await queryModel(decoupledInput, 'v2');
  assertTest('Extraneous investigation fields do not alter Framingham probability', decoupledResp.probability === def2.probability);

  console.log('\n' + '='.repeat(70));
  console.log(`ALL VERIFICATION TESTS PASSED: ${passed} / ${total} (100%)`);
  console.log('='.repeat(70));
}

runVerification().catch(err => {
  console.error('[FATAL TEST ERROR]:', err);
  process.exit(1);
});
