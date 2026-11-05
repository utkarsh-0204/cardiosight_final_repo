// =============================================================================
// Comprehensive Automated Test Suite for CardioSight Authentication,
// Stale Session Handling, and Dashboard Data Isolation.
// =============================================================================
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const http = require('http');
const jwt = require('jsonwebtoken');
const pool = require('./config/db');

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
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('====================================================');
  console.log('STARTING AUTHENTICATION & DASHBOARD VERIFICATION SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 1: UNAUTHENTICATED REQUESTS
  // ---------------------------------------------------------------------------
  console.log('--- TEST GROUP 1: UNAUTHENTICATED REQUEST REJECTION ---');
  const unauthDash = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard',
    method: 'GET',
  });
  assert(unauthDash.status === 401, 'Unauthenticated /api/dashboard returns HTTP 401');
  assert(unauthDash.body?.message === 'Authentication required.', 'Unauthenticated message is "Authentication required."');

  const unauthMe = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
  });
  assert(unauthMe.status === 401, 'Unauthenticated /api/auth/me returns HTTP 401');

  // ---------------------------------------------------------------------------
  // TEST GROUP 2: VERIFIED FAILURE SCENARIO (STALE JWT / DELETED USER)
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: STALE TOKEN / NON-EXISTENT USER SCENARIO ---');
  const nonExistentUserId = '00000000-0000-0000-0000-000000000000';
  const staleToken = jwt.sign(
    { sub: nonExistentUserId, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const staleEndpoints = [
    { name: '/api/auth/me', path: '/api/auth/me' },
    { name: '/api/dashboard', path: '/api/dashboard' },
    { name: '/api/dashboard/notifications', path: '/api/dashboard/notifications' },
    { name: '/api/dashboard/activities', path: '/api/dashboard/activities' },
    { name: '/api/dashboard/tips', path: '/api/dashboard/tips' },
    { name: '/api/history', path: '/api/history' },
    { name: '/api/analytics', path: '/api/analytics' },
  ];

  for (const ep of staleEndpoints) {
    const res = await request({
      hostname: 'localhost',
      port: 3000,
      path: ep.path,
      method: 'GET',
      headers: { Authorization: `Bearer ${staleToken}` },
    });
    assert(
      res.status === 401 && res.body?.message === 'User account no longer exists.',
      `Stale token on ${ep.name} returns HTTP 401 "User account no longer exists."`
    );
  }

  // ---------------------------------------------------------------------------
  // TEST GROUP 3: CORRUPTED / EXPIRED TOKEN SIGNATURE
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: INVALID TOKEN SIGNATURE ---');
  const invalidSigRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard',
    method: 'GET',
    headers: { Authorization: 'Bearer invalid.token.payload' },
  });
  assert(invalidSigRes.status === 401, 'Corrupted token rejected with HTTP 401');
  assert(invalidSigRes.body?.message === 'Invalid or expired token.', 'Corrupted token error message is "Invalid or expired token."');

  // ---------------------------------------------------------------------------
  // TEST GROUP 4: VALID AUTHENTICATION & SESSION VALIDATION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: VALID AUTHENTICATION (/api/auth/login, /api/auth/me) ---');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@cardiosight.local', password: 'Admin@12345' }
  );
  assert(loginRes.status === 200 && loginRes.body?.success, 'Admin login succeeds with HTTP 200');
  const adminToken = loginRes.body?.data?.tokens?.accessToken;
  const adminUser = loginRes.body?.data?.user;
  assert(Boolean(adminToken), 'JWT access token issued on login');
  assert(adminUser?.email === 'admin@cardiosight.local', 'Logged-in user object has email admin@cardiosight.local');

  const meRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/auth/me',
    method: 'GET',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(meRes.status === 200 && meRes.body?.success, 'Session validation /api/auth/me returns HTTP 200');
  assert(meRes.body?.data?.id === adminUser.id, '/api/auth/me returns identical user ID');

  // ---------------------------------------------------------------------------
  // TEST GROUP 5: AUTHENTICATED USER DATA INTEGRITY & ISOLATION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: DASHBOARD DATA FOR EXISTING USER (UTKARSH SOOD) ---');
  const { rows: uRows } = await pool.query("SELECT id FROM users WHERE email = 'utkarshsood51@gmail.com'");
  const utkarshId = uRows[0] ? uRows[0].id : '2c9eade5-67b9-4fd7-b716-b7f7dc54b61f';
  const utkarshToken = jwt.sign(
    { sub: utkarshId, role: 'patient' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  const utkarshDash = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard',
    method: 'GET',
    headers: { Authorization: `Bearer ${utkarshToken}` },
  });
  assert(utkarshDash.status === 200 && utkarshDash.body?.success, 'Utkarsh Sood dashboard loads with HTTP 200');
  const { rows: latestRows } = await pool.query(
    'SELECT risk_score, risk_level FROM predictions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
    [utkarshId]
  );
  const expectedHealthScore = Math.max(0, Math.min(100, Math.round(100 - Number(latestRows[0].risk_score))));
  const expectedRiskLevel = latestRows[0].risk_level;
  const dashData = utkarshDash.body?.data;
  assert(dashData.healthScore === expectedHealthScore, `Health score computed correctly (expected ${expectedHealthScore}, got ${dashData?.healthScore})`);
  assert(dashData.riskLevel === expectedRiskLevel, `Risk level matches latest assessment (expected '${expectedRiskLevel}', got '${dashData?.riskLevel}')`);
  const { rows: dbCount } = await pool.query('SELECT COUNT(*)::int AS count FROM predictions WHERE user_id = $1', [utkarshId]);
  assert(dashData.totalPredictions === dbCount[0].count, `Total predictions count matches database count (${dbCount[0].count})`);
  assert(dashData.recentPredictions?.length === 5, 'Recent predictions list contains 5 items (paginated)');
  assert(dashData.recentPredictions[0].patientName.toLowerCase() === 'utkarsh sood', 'Prediction ownership belongs to Utkarsh Sood');

  // Verify dashboard auxiliary feeds
  const utkarshNotifs = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard/notifications',
    method: 'GET',
    headers: { Authorization: `Bearer ${utkarshToken}` },
  });
  assert(utkarshNotifs.status === 200 && Array.isArray(utkarshNotifs.body?.data), '/api/dashboard/notifications returns HTTP 200 array');

  const utkarshActs = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard/activities',
    method: 'GET',
    headers: { Authorization: `Bearer ${utkarshToken}` },
  });
  assert(utkarshActs.status === 200 && Array.isArray(utkarshActs.body?.data), '/api/dashboard/activities returns HTTP 200 array');

  const utkarshTips = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard/tips',
    method: 'GET',
    headers: { Authorization: `Bearer ${utkarshToken}` },
  });
  assert(utkarshTips.status === 200 && Array.isArray(utkarshTips.body?.data), '/api/dashboard/tips returns HTTP 200 array');

  // ---------------------------------------------------------------------------
  // TEST GROUP 6: NEW USER EMPTY STATE & USER ISOLATION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: NEW USER REGISTRATION & EMPTY DASHBOARD STATE ---');
  const freshEmail = `verify_empty_${Date.now()}@cardiosight.test`;
  const registerRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    {
      firstName: 'Empty',
      lastName: 'Tester',
      email: freshEmail,
      password: 'Password@123',
      gender: 'other',
    }
  );
  assert(registerRes.status === 201 && registerRes.body?.success, 'New user registered with HTTP 201');
  const freshToken = registerRes.body?.data?.tokens?.accessToken;
  const freshUserId = registerRes.body?.data?.user?.id;

  const freshDash = await request({
    hostname: 'localhost',
    port: 3000,
    path: '/api/dashboard',
    method: 'GET',
    headers: { Authorization: `Bearer ${freshToken}` },
  });
  assert(freshDash.status === 200 && freshDash.body?.success, 'New user dashboard loads with HTTP 200');
  assert(freshDash.body?.data?.totalPredictions === 0, 'New user total predictions is 0 (isolated from existing users)');
  assert(freshDash.body?.data?.recentPredictions?.length === 0, 'New user recent predictions array is empty (clean empty state)');

  // Clean up registered test user to keep DB tidy
  await pool.query('DELETE FROM patients WHERE user_id = $1', [freshUserId]);
  await pool.query('DELETE FROM verification_codes WHERE user_id = $1', [freshUserId]);
  await pool.query('DELETE FROM users WHERE id = $1', [freshUserId]);
  console.log('[CLEANUP] Temporary test user cleaned up safely.');

  // ---------------------------------------------------------------------------
  // TEST GROUP 7: ML SERVICE CONNECTIVITY & PREDICTION/SHAP INTEGRATION
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST GROUP 7: ML SERVICE CONNECTIVITY (EXPRESS -> DJANGO) ---');
  const mlHealth = await request({
    hostname: '127.0.0.1',
    port: 8000,
    path: '/api/health',
    method: 'GET',
  });
  assert(mlHealth.status === 200 && mlHealth.body?.status === 'up', 'Django ML service directly reachable at 127.0.0.1:8000 and reports status "up"');

  const testPredictRes = await request(
    {
      hostname: 'localhost',
      port: 3000,
      path: '/api/predict',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${utkarshToken}`,
      },
    },
    {
      male: 1,
      age: 56,
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
    }
  );
  assert(testPredictRes.status === 201 && testPredictRes.body?.success, 'Express successfully called Django ML service for prediction (HTTP 201 Created)');
  const createdPredId = testPredictRes.body?.data?.id;
  assert(Boolean(createdPredId), 'Prediction record stored and ID returned');
  assert(typeof testPredictRes.body?.data?.riskScore === 'number', 'Risk score calculated by ML model');

  const testExplainRes = await request({
    hostname: 'localhost',
    port: 3000,
    path: `/api/predict/${createdPredId}/explain`,
    method: 'GET',
    headers: { Authorization: `Bearer ${utkarshToken}` },
  });
  assert(testExplainRes.status === 200 && testExplainRes.body?.success, 'Express successfully called Django SHAP TreeExplainer (HTTP 200 OK)');
  assert(testExplainRes.body?.data?.mathematical_consistency === true, 'SHAP attributions mathematically consistent with model prediction');

  // Clean up prediction record
  await pool.query('DELETE FROM predictions WHERE id = $1', [createdPredId]);

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  await pool.end();
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test execution error:', err);
  pool.end();
  process.exit(1);
});
