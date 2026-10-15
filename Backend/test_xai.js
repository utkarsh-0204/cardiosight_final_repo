// =============================================================================
// Comprehensive Automated Test Suite for CardioSight Explainable AI (XAI)
// =============================================================================
const axios = require('axios');

const API_BASE = 'http://localhost:3000/api';
const ML_BASE = 'http://localhost:8000/api';

async function runTests() {
  console.log('=================================================================');
  console.log('CardioSight Explainable AI (XAI) Verification Test Suite');
  console.log('=================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Authenticate primary user (admin)
  console.log('1. Authenticating Admin User...');
  const loginRes = await axios.post(`${API_BASE}/auth/login`, {
    email: 'admin@cardiosight.local',
    password: 'Admin@12345',
  });
  const token = loginRes.data.data.tokens.accessToken;
  const adminId = loginRes.data.data.user.id;
  assert(Boolean(token), 'Admin logged in and JWT token acquired');

  // 2. Authentication & Authorization Checks
  console.log('\n2. Testing Authentication & Authorization Security...');
  try {
    await axios.get(`${API_BASE}/predict/any-id/explain`);
    assert(false, 'Expected 401 Unauthorized when missing token');
  } catch (err) {
    assert(err.response?.status === 401, 'Request without token rejected with 401 Unauthorized');
  }

  try {
    await axios.get(`${API_BASE}/predict/00000000-0000-0000-0000-000000000000/explain`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    assert(false, 'Expected 404 Not Found for non-existent prediction record');
  } catch (err) {
    assert(err.response?.status === 404, 'Non-existent prediction ID returned 404 Not Found');
  }

  // Register a secondary user to test User Data Isolation
  console.log('\n3. Testing User Data Isolation...');
  const secondEmail = `testuser_${Date.now()}@cardiosight.local`;
  const registerRes = await axios.post(`${API_BASE}/auth/register`, {
    firstName: 'Isolated',
    lastName: 'Patient',
    email: secondEmail,
    password: 'Password@123',
    gender: 'female',
  });
  const secondToken = registerRes.data.data.tokens.accessToken;
  assert(Boolean(secondToken), 'Secondary test user registered for isolation testing');

  // 4. Create a valid Framingham prediction
  console.log('\n4. Executing Framingham Prediction Regression & Record Creation...');
  const testInput = {
    male: 1,
    age: 58,
    education: 2,
    currentSmoker: 1,
    cigsPerDay: 25,
    BPMeds: 0,
    prevalentStroke: 0,
    prevalentHyp: 1,
    diabetes: 0,
    totChol: 260,
    sysBP: 155,
    diaBP: 95,
    BMI: 28.4,
    heartRate: 82,
    glucose: 105,
  };

  const predictRes = await axios.post(`${API_BASE}/predict`, testInput, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(predictRes.status === 201, 'Prediction created with 201 Created');
  const predictionId = predictRes.data.data.id;
  const initialProbability = predictRes.data.data.diseaseProbability;
  assert(Boolean(predictionId), `Prediction record ID generated: ${predictionId}`);
  assert(typeof initialProbability === 'number', `Prediction probability returned: ${initialProbability}%`);

  // Verify secondary user cannot access admin's explanation
  try {
    await axios.get(`${API_BASE}/predict/${predictionId}/explain`, {
      headers: { Authorization: `Bearer ${secondToken}` },
    });
    assert(false, 'Expected 404/403 when user attempts to access another user\'s explanation');
  } catch (err) {
    assert(err.response?.status === 404, 'Cross-user access denied with 404 Not Found (User isolation confirmed)');
  }

  // 5. Test Explanation for the created prediction
  console.log('\n5. Testing Explainable AI (SHAP TreeExplainer) for Prediction...');
  const explainRes = await axios.get(`${API_BASE}/predict/${predictionId}/explain`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert(explainRes.status === 200, 'Explanation retrieved with 200 OK');
  const xai = explainRes.data.data;

  assert(xai.model_type === 'RandomForestClassifier', 'Model identified as RandomForestClassifier');
  assert(xai.explanation_method === 'SHAP (TreeExplainer)', 'Explanation method verified as SHAP (TreeExplainer)');
  assert(xai.time_horizon === '10-Year Coronary Heart Disease Risk', 'Time horizon correctly identified as 10-Year CHD Risk');
  assert(xai.feature_contributions.length === 15, 'All 15 Framingham features explained');

  // Verify feature names match Framingham features
  const expectedFeatures = [
    'male', 'age', 'education', 'currentSmoker', 'cigsPerDay',
    'BPMeds', 'prevalentStroke', 'prevalentHyp', 'diabetes',
    'totChol', 'sysBP', 'diaBP', 'BMI', 'heartRate', 'glucose'
  ];
  const actualFeatures = xai.feature_contributions.map(c => c.feature);
  const allFeaturesPresent = expectedFeatures.every(f => actualFeatures.includes(f));
  assert(allFeaturesPresent, 'All 15 Framingham feature names mapped and accounted for');

  // 6. Mathematical Consistency Verification
  console.log('\n6. Verifying Mathematical Consistency of SHAP Attributions...');
  const baseValue = xai.base_value;
  const predictedProb = xai.predicted_probability;
  const reconstructedProb = xai.reconstructed_probability;
  const totalShapShifts = xai.feature_contributions.reduce((sum, c) => sum + c.contribution_pct, 0);
  const mathDiff = Math.abs((baseValue + totalShapShifts) - predictedProb);

  console.log(`     Baseline Prior:              ${baseValue}%`);
  console.log(`     Sum of SHAP Shifts:         ${totalShapShifts > 0 ? '+' : ''}${totalShapShifts.toFixed(2)}%`);
  console.log(`     Reconstructed Probability:  ${reconstructedProb}%`);
  console.log(`     Model Predicted Probability:${predictedProb}%`);
  console.log(`     Discrepancy:                ${mathDiff.toFixed(4)}%`);

  assert(xai.mathematical_consistency === true, 'API reports mathematical_consistency = true');
  assert(mathDiff < 0.2, 'Baseline Prior + Sum(SHAP attributions) matches Predicted Probability within 0.2% tolerance');

  // 7. Verify Top Contributing Factors (Positive & Negative)
  console.log('\n7. Verifying Top Contributing Factors...');
  assert(Array.isArray(xai.top_positive_factors), 'Top positive factors list is present');
  assert(Array.isArray(xai.top_negative_factors), 'Top negative factors list is present');

  if (xai.top_positive_factors.length > 0) {
    const topPos = xai.top_positive_factors[0];
    assert(topPos.direction === 'increased_risk', `Top positive factor (${topPos.label}) has direction 'increased_risk'`);
    assert(topPos.contribution_pct > 0, `Top positive factor (${topPos.label}) contribution is positive: +${topPos.contribution_pct}%`);
    assert(Boolean(topPos.formatted_value), `Formatted input value is present: ${topPos.formatted_value}`);
    assert(Boolean(topPos.clinical_insight), `Clinical insight is present: "${topPos.clinical_insight}"`);
  }

  if (xai.top_negative_factors.length > 0) {
    const topNeg = xai.top_negative_factors[0];
    assert(topNeg.direction === 'decreased_risk', `Top negative factor (${topNeg.label}) has direction 'decreased_risk'`);
    assert(topNeg.contribution_pct < 0, `Top negative factor (${topNeg.label}) contribution is negative: ${topNeg.contribution_pct}%`);
  }

  // 8. Verify SHAP Waterfall Steps
  console.log('\n8. Verifying SHAP Waterfall Steps Structure...');
  assert(Array.isArray(xai.waterfall_steps), 'Waterfall steps array is present');
  assert(xai.waterfall_steps.length >= 17, `Waterfall has all steps (${xai.waterfall_steps.length} steps: baseline + 15 features + final)`);
  assert(xai.waterfall_steps[0].type === 'baseline', 'First waterfall step is baseline prior');
  assert(xai.waterfall_steps[xai.waterfall_steps.length - 1].type === 'final', 'Last waterfall step is final predicted risk');

  // Check cumulative progression
  let stepRunning = xai.waterfall_steps[0].running_total;
  let waterfallContinuous = true;
  for (let i = 1; i < xai.waterfall_steps.length - 1; i++) {
    const step = xai.waterfall_steps[i];
    stepRunning = Math.round((stepRunning + step.shift) * 100) / 100;
    if (Math.abs(stepRunning - step.running_total) > 0.1) {
      waterfallContinuous = false;
      break;
    }
  }
  assert(waterfallContinuous, 'Waterfall steps form a continuous and cumulative running total');

  // 9. Verify Global Feature Importance
  console.log('\n9. Verifying Global Feature Importance...');
  assert(Array.isArray(xai.global_feature_importance), 'Global feature importance array is present');
  assert(xai.global_feature_importance.length === 15, 'Global importance covers all 15 features');
  const sumImportance = xai.global_feature_importance.reduce((acc, g) => acc + g.importance, 0);
  assert(Math.abs(sumImportance - 100.0) < 1.0, `Sum of global feature importances is approximately 100% (${sumImportance.toFixed(2)}%)`);

  // 10. Verify Dynamic Personalized Explanation & Medical Disclaimer
  console.log('\n10. Verifying Dynamic Personalized Explanation & Disclaimers...');
  assert(typeof xai.personalized_explanation === 'string' && xai.personalized_explanation.length > 50,
    'Personalized explanation generated dynamically');
  console.log('     Generated narrative excerpt:');
  console.log(`     "${xai.personalized_explanation.slice(0, 140)}..."`);

  assert(typeof xai.disclaimer === 'string', 'Medical disclaimer is present');
  assert(xai.disclaimer.includes('rather than physiological medical causation'),
    'Disclaimer explicitly clarifies attribution represents model behavior rather than medical causation');

  // 11. Error Handling: Direct ML Server Tests
  console.log('\n11. Testing ML Service Error Handling Directly...');
  try {
    await axios.post(`${ML_BASE}/explain`, { features: {} });
    assert(false, 'Expected 400 when sending empty features');
  } catch (err) {
    assert(err.response?.status === 400, 'ML service returned 400 for empty features payload');
  }

  console.log('\n=================================================================');
  console.log(`Test Suite Completed: ${passed} Passed, ${failed} Failed`);
  console.log('=================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution failed unexpectedly:', err);
  process.exit(1);
});
