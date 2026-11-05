// =============================================================================
// Admin controller – platform stats, user management, prediction monitoring,
// system health, activity feed, and audit logging.
// All routes are strictly protected by requireRole('admin').
// =============================================================================
const pool = require('../config/db');
const axios = require('axios');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { serializeUser } = require('./authController');

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const AGE_BUCKETS = [
  { range: '18-30', min: 18, max: 30 },
  { range: '31-40', min: 31, max: 40 },
  { range: '41-50', min: 41, max: 50 },
  { range: '51-60', min: 51, max: 60 },
  { range: '60+', min: 61, max: 999 },
];

/** Helper to record administrative audit events */
async function recordAuditLog(adminId, adminEmail, action, targetType, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, admin_email, action, target_type, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [adminId, adminEmail || 'admin@cardiosight.local', action, targetType, targetId, JSON.stringify(details)]
    );
  } catch (err) {
    console.warn('[adminController] Failed to record audit log:', err.message);
  }
}

/** GET /api/admin/stats */
const getStats = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM users) AS total_users,
       (SELECT COUNT(*)::int FROM users WHERE role = 'patient' AND (is_test IS FALSE OR is_test IS NULL)) AS genuine_patients,
       (SELECT COUNT(*)::int FROM users WHERE role = 'admin') AS admins,
       (SELECT COUNT(*)::int FROM users WHERE is_test IS TRUE) AS test_accounts,
       (SELECT COUNT(*)::int FROM predictions) AS total_predictions,
       (SELECT COUNT(*)::int FROM predictions WHERE created_at >= now() - interval '7 days') AS predictions_this_week,
       (SELECT COUNT(*)::int FROM predictions WHERE risk_level = 'high') AS high_risk_predictions,
       (SELECT COALESCE(ROUND(AVG(risk_score)), 0)::int FROM predictions) AS avg_risk_score,
       (SELECT COUNT(*)::int FROM users WHERE role = 'patient' AND (is_test IS FALSE OR is_test IS NULL) AND created_at >= date_trunc('month', now())) AS new_patients_this_month`
  );
  const s = rows[0];

  const { rows: preds } = await pool.query(
    `SELECT risk_level, risk_score, input, created_at FROM predictions ORDER BY created_at ASC`
  );

  const total = preds.length;
  const high = preds.filter((r) => r.risk_level === 'high').length;
  const medium = preds.filter((r) => r.risk_level === 'medium').length;
  const low = preds.filter((r) => r.risk_level === 'low').length;

  let male = 0;
  let female = 0;
  for (const r of preds) {
    const inp = r.input || {};
    if (inp.male === 1 || inp.male === '1' || inp.male === true || (typeof inp.gender === 'string' && inp.gender.toLowerCase() === 'male')) {
      male += 1;
    } else if (inp.male === 0 || inp.male === '0' || inp.male === false || (typeof inp.gender === 'string' && inp.gender.toLowerCase() === 'female')) {
      female += 1;
    }
  }

  const ageDistribution = AGE_BUCKETS.map((b) => {
    const inRange = preds.filter((r) => {
      const rawAge = (r.input || {}).age;
      const age = rawAge != null ? Number(rawAge) : null;
      return age != null && !isNaN(age) && age >= b.min && age <= b.max;
    });
    return {
      range: b.range,
      total: inRange.length,
      highRisk: inRange.filter((r) => r.risk_level === 'high').length,
    };
  });

  const monthlyKeys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyKeys.push({ key, month: MONTHS[d.getMonth()] });
  }

  const monthlyPredictions = monthlyKeys.map(({ key, month }) => {
    const monthRecords = preds.filter((r) => {
      const recDate = new Date(r.created_at);
      const recKey = `${recDate.getFullYear()}-${String(recDate.getMonth() + 1).padStart(2, '0')}`;
      return recKey === key;
    });
    return {
      month,
      predictions: monthRecords.length,
      highRisk: monthRecords.filter((r) => r.risk_level === 'high').length,
    };
  });

  res.json({
    success: true,
    message: 'Admin stats retrieved.',
    data: {
      totalUsers: s.total_users,
      totalPatients: s.genuine_patients,
      patients: s.genuine_patients,
      admins: s.admins,
      totalAdmins: s.admins,
      testAccounts: s.test_accounts,
      totalPredictions: s.total_predictions,
      predictionsThisWeek: s.predictions_this_week,
      highRiskPredictions: s.high_risk_predictions,
      highRiskRate: total ? Math.round((high / total) * 100) : 0,
      avgRiskScore: s.avg_risk_score,
      newUsersThisMonth: s.new_patients_this_month,
      newPatientsThisMonth: s.new_patients_this_month,
      riskDistribution: [
        { label: 'Low risk', value: low, color: '#43A047' },
        { label: 'Medium risk', value: medium, color: '#F9A825' },
        { label: 'High risk', value: high, color: '#E53935' },
      ],
      genderDistribution: [
        { label: 'Male', value: male },
        { label: 'Female', value: female },
      ],
      ageDistribution,
      monthlyPredictions,
    },
  });
});

/** GET /api/admin/users */
const getUsers = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const typeFilter = String(req.query.type || 'all').toLowerCase().trim(); // 'genuine', 'test', 'all'
  const roleFilter = String(req.query.role || 'all').toLowerCase().trim(); // 'patient', 'admin', 'all'
  const statusFilter = String(req.query.status || 'all').toLowerCase().trim(); // 'active', 'inactive', 'suspended', 'all'
  const sortBy = String(req.query.sortBy || 'createdAt');
  const sortDir = String(req.query.order || req.query.sortDir || 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const paginate = req.query.paginate === 'true';

  const conditions = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(CONCAT(u.first_name, ' ', u.last_name) ILIKE $${values.length} OR u.email ILIKE $${values.length})`);
  }

  if (typeFilter === 'genuine') {
    conditions.push(`(u.is_test IS FALSE OR u.is_test IS NULL)`);
  } else if (typeFilter === 'test') {
    conditions.push(`u.is_test IS TRUE`);
  }

  if (roleFilter && roleFilter !== 'all') {
    values.push(roleFilter);
    conditions.push(`u.role = $${values.length}`);
  }

  if (statusFilter && statusFilter !== 'all') {
    values.push(statusFilter);
    conditions.push(`COALESCE(u.status, 'active') = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sortColumns = {
    createdAt: 'u.created_at',
    lastActiveAt: 'last_active_at',
    predictionsCount: 'predictions_count',
    name: 'u.first_name',
  };
  const orderByColumn = sortColumns[sortBy] || 'u.created_at';

  // Count total for pagination
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM users u
       ${whereClause}`,
    values
  );
  const total = countRows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;

  // Query users with prediction counts and last active
  const queryValues = [...values];
  let paginationSql = '';
  if (paginate) {
    queryValues.push(limit, offset);
    paginationSql = `LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`;
  }

  const { rows } = await pool.query(
    `SELECT u.*,
            COUNT(p.id)::int AS predictions_count,
            COALESCE(MAX(p.created_at), u.created_at) AS last_active_at
       FROM users u
       LEFT JOIN predictions p ON p.user_id = u.id
       ${whereClause}
      GROUP BY u.id
      ORDER BY ${orderByColumn} ${sortDir}
      ${paginationSql}`,
    queryValues
  );

  const now = Date.now();
  const sevenDays = 7 * 24 * 3600 * 1000;

  const usersList = rows.map((row) => {
    const lastActive = new Date(row.last_active_at).getTime();
    const computedStatus = row.status === 'suspended'
      ? 'suspended'
      : (now - lastActive <= sevenDays ? 'active' : 'inactive');

    return {
      ...serializeUser(row),
      isTest: Boolean(row.is_test),
      accountType: row.is_test ? 'test' : (row.role === 'admin' ? 'admin' : 'genuine'),
      status: computedStatus,
      rawStatus: row.status || 'active',
      predictionsCount: row.predictions_count,
      lastActiveAt: new Date(row.last_active_at).toISOString(),
    };
  });

  if (paginate) {
    res.json({
      success: true,
      message: 'Users retrieved.',
      data: {
        users: usersList,
        total,
        page,
        limit,
        totalPages,
      },
    });
  } else {
    // Array return for backward compatibility with existing tests
    res.json({ success: true, message: 'Users retrieved.', data: usersList, meta: { total, page, limit, totalPages } });
  }
});

/** GET /api/admin/users/:id - View patient account details */
const getUserDetails = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found.');

  const user = rows[0];

  // Fetch prediction summary
  const { rows: predRows } = await pool.query(
    `SELECT COUNT(*)::int AS count,
            COALESCE(ROUND(AVG(risk_score), 1), 0)::numeric AS avg_risk,
            MAX(created_at) AS last_prediction_at
       FROM predictions
      WHERE user_id = $1`,
    [id]
  );
  const predSummary = predRows[0] || { count: 0, avg_risk: 0, last_prediction_at: null };

  // Fetch latest prediction record
  const { rows: latestPred } = await pool.query(
    `SELECT id, risk_level, risk_score, probability, created_at
       FROM predictions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1`,
    [id]
  );

  // Record audit log
  await recordAuditLog(req.user.id, req.user.email, 'ADMIN_VIEW_USER_DETAILS', 'user', id, {
    targetEmail: user.email,
    targetRole: user.role,
  });

  res.json({
    success: true,
    message: 'User details retrieved.',
    data: {
      ...serializeUser(user),
      isTest: Boolean(user.is_test),
      status: user.status || 'active',
      stats: {
        predictionsCount: predSummary.count,
        avgRiskScore: Number(predSummary.avg_risk),
        lastPredictionAt: predSummary.last_prediction_at ? new Date(predSummary.last_prediction_at).toISOString() : null,
        latestAssessment: latestPred[0] || null,
      },
    },
  });
});

/** GET /api/admin/users/:id/predictions - View a patient's prediction history */
const getUserPredictions = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { rows: userRows } = await pool.query('SELECT first_name, last_name, email, role FROM users WHERE id = $1', [id]);
  if (userRows.length === 0) throw new HttpError(404, 'User not found.');

  const patient = userRows[0];

  const { rows } = await pool.query(
    `SELECT id, risk_level, risk_score, probability, confidence, input, created_at
       FROM predictions
      WHERE user_id = $1
      ORDER BY created_at DESC`,
    [id]
  );

  // Record audit log
  await recordAuditLog(req.user.id, req.user.email, 'ADMIN_VIEW_PATIENT_PREDICTION_HISTORY', 'user', id, {
    targetEmail: patient.email,
    recordsCount: rows.length,
  });

  res.json({
    success: true,
    message: 'Patient prediction history retrieved.',
    data: {
      patient: {
        id,
        name: `${patient.first_name} ${patient.last_name}`,
        email: patient.email,
        role: patient.role,
      },
      predictions: rows.map((r) => ({
        id: r.id,
        riskLevel: r.risk_level,
        riskScore: Number(r.risk_score),
        probability: Number(r.probability),
        confidence: Number(r.confidence),
        hasEcg: Boolean(r.input?.ecg && Object.keys(r.input.ecg).length > 0),
        hasTmt: Boolean(r.input?.tmt && Object.keys(r.input.tmt).length > 0),
        submittedAt: new Date(r.created_at).toISOString(),
      })),
    },
  });
});

/** PATCH /api/admin/users/:id/status - Toggle user activation/suspension */
const updateUserStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};

  const validStatuses = ['active', 'inactive', 'suspended'];
  if (!status || !validStatuses.includes(status)) {
    throw new HttpError(400, `Invalid status. Must be one of: ${validStatuses.join(', ')}`);
  }

  if (id === req.user.id) {
    throw new HttpError(400, 'Administrators cannot modify their own account status.');
  }

  const { rows } = await pool.query('SELECT role, email, status FROM users WHERE id = $1', [id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found.');
  if (rows[0].role === 'admin') {
    throw new HttpError(403, 'Administrator accounts cannot be suspended.');
  }

  await pool.query('UPDATE users SET status = $1 WHERE id = $2', [status, id]);

  // Record audit log
  await recordAuditLog(req.user.id, req.user.email, 'ADMIN_UPDATE_USER_STATUS', 'user', id, {
    targetEmail: rows[0].email,
    previousStatus: rows[0].status || 'active',
    newStatus: status,
  });

  res.json({
    success: true,
    message: `Account status updated to ${status}.`,
    data: { id, status },
  });
});

/** DELETE /api/admin/users/:id */
const deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (id === req.user.id) {
    throw new HttpError(400, 'You cannot delete your own account.');
  }

  const { rows } = await pool.query('SELECT role, email, first_name, last_name FROM users WHERE id = $1', [id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found.');
  if (rows[0].role === 'admin') {
    throw new HttpError(403, 'Admin accounts cannot be deleted.');
  }

  const user = rows[0];

  // Cascading cleanup of user predictions, verification codes, and user row
  await pool.query('DELETE FROM predictions WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM verification_codes WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM patients WHERE user_id = $1', [id]);
  await pool.query('DELETE FROM users WHERE id = $1', [id]);

  // Record audit log
  await recordAuditLog(req.user.id, req.user.email, 'ADMIN_DELETE_USER', 'user', id, {
    deletedEmail: user.email,
    deletedName: `${user.first_name} ${user.last_name}`,
  });

  res.json({ success: true, message: 'User account removed.', data: { message: 'User account removed.' } });
});

/** GET /api/admin/predictions - Prediction Monitoring */
const getPredictions = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const risk = String(req.query.riskLevel || req.query.risk || 'all').toLowerCase();
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 15));

  const conditions = [];
  const values = [];

  if (search) {
    values.push(`%${search}%`);
    conditions.push(`(CONCAT(u.first_name, ' ', u.last_name) ILIKE $${values.length} OR u.email ILIKE $${values.length} OR p.id::text ILIKE $${values.length})`);
  }

  if (risk && risk !== 'all') {
    values.push(risk);
    conditions.push(`p.risk_level = $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
       FROM predictions p
       JOIN users u ON u.id = p.user_id
       ${whereClause}`,
    values
  );
  const total = countRows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;

  const queryValues = [...values, limit, offset];
  const { rows } = await pool.query(
    `SELECT p.id, p.user_id, p.risk_level, p.risk_score, p.probability, p.confidence, p.created_at, p.input,
            u.first_name, u.last_name, u.email, u.is_test
       FROM predictions p
       JOIN users u ON u.id = p.user_id
       ${whereClause}
      ORDER BY p.created_at DESC
      LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
    queryValues
  );

  const predictions = rows.map((r) => ({
    id: r.id,
    patientId: r.user_id,
    patientName: `${r.first_name} ${r.last_name}`,
    patientEmail: r.email,
    isTestPatient: Boolean(r.is_test),
    riskLevel: r.risk_level,
    riskScore: Number(r.risk_score),
    probability: Number(r.probability),
    confidence: Number(r.confidence),
    hasEcg: Boolean(r.input?.ecg && Object.keys(r.input.ecg).length > 0),
    hasTmt: Boolean(r.input?.tmt && Object.keys(r.input.tmt).length > 0),
    submittedAt: new Date(r.created_at).toISOString(),
  }));

  res.json({
    success: true,
    message: 'Predictions retrieved.',
    data: {
      predictions,
      total,
      page,
      limit,
      totalPages,
    },
  });
});

/** GET /api/admin/activities - Combined system and audit activity feed */
const getActivities = asyncHandler(async (req, res) => {
  // Query recent predictions
  const { rows: preds } = await pool.query(
    `SELECT p.id, p.risk_level, p.risk_score, p.created_at, u.first_name, u.last_name
       FROM predictions p JOIN users u ON u.id = p.user_id
      ORDER BY p.created_at DESC
      LIMIT 5`
  );

  // Query recent users
  const { rows: newUsers } = await pool.query(
    `SELECT first_name, last_name, role, is_test, created_at FROM users ORDER BY created_at DESC LIMIT 5`
  );

  // Query recent audit logs
  const { rows: auditRows } = await pool.query(
    `SELECT id, admin_email, action, target_type, target_id, details, created_at
       FROM audit_logs
      ORDER BY created_at DESC
      LIMIT 5`
  );

  const activities = [];

  preds.forEach((p, i) => {
    activities.push({
      id: `adm_act_pred_${i}_${p.id.slice(0, 8)}`,
      user: `${p.first_name} ${p.last_name}`,
      role: 'patient',
      action: 'submitted risk assessment',
      target: `Risk: ${cap(p.risk_level)} (${p.risk_score}%)`,
      icon: 'insights',
      createdAt: new Date(p.created_at).toISOString(),
    });
  });

  newUsers.forEach((u, i) => {
    activities.push({
      id: `adm_act_user_${i}`,
      user: `${u.first_name} ${u.last_name}`,
      role: u.role,
      action: u.is_test ? 'registered automated test account' : 'registered new patient account',
      target: u.is_test ? 'QA / Test Account' : 'Genuine Patient Onboarded',
      icon: u.is_test ? 'biotech' : 'person_add',
      createdAt: new Date(u.created_at).toISOString(),
    });
  });

  auditRows.forEach((a, i) => {
    activities.push({
      id: `adm_act_audit_${i}_${a.id.slice(0, 8)}`,
      user: a.admin_email || 'Administrator',
      role: 'admin',
      action: a.action.replace(/_/g, ' ').toLowerCase(),
      target: `${a.target_type || 'system'}: ${a.target_id || ''}`,
      icon: 'security',
      createdAt: new Date(a.created_at).toISOString(),
    });
  });

  activities.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ success: true, message: 'Activities retrieved.', data: activities.slice(0, 10) });
});

/** GET /api/admin/health - Comprehensive system and microservice health checks */
const getSystemHealth = asyncHandler(async (req, res) => {
  const startDb = Date.now();
  let dbStatus = 'healthy';
  let dbLatency = 0;
  let dbError = null;

  try {
    await pool.query('SELECT 1');
    dbLatency = Date.now() - startDb;
  } catch (err) {
    dbStatus = 'unhealthy';
    dbError = err.message;
  }

  const startMl = Date.now();
  let mlStatus = 'healthy';
  let mlLatency = 0;
  let mlDetails = null;

  try {
    const mlRes = await axios.get('http://127.0.0.1:8000/api/health', { timeout: 3000 });
    mlLatency = Date.now() - startMl;
    mlDetails = {
      status: mlRes.data?.status || 'up',
      models: [
        { name: 'Framingham CHD (V1 Baseline)', status: 'active', type: 'RandomForest' },
        { name: 'Framingham Platt-Calibrated (V2 Candidate)', status: 'ready', type: 'CalibratedClassifier' },
        { name: 'UCI Cleveland CAD (TMT Model)', status: 'active', type: 'ExtraTreesClassifier' },
        { name: 'Deterministic 12-Lead ECG Rule Engine', status: 'active', type: 'Rule-based Clinical' },
      ],
    };
  } catch (err) {
    mlStatus = 'unhealthy';
    mlDetails = { error: err.message };
  }

  const mem = process.memoryUsage();
  const uptimeSec = Math.floor(process.uptime());

  res.json({
    success: true,
    message: 'System health report generated.',
    data: {
      overallStatus: dbStatus === 'healthy' && mlStatus === 'healthy' ? 'operational' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          name: 'PostgreSQL Database',
          status: dbStatus,
          latencyMs: dbLatency,
          error: dbError,
        },
        mlMicroservice: {
          name: 'Django ML Service',
          status: mlStatus,
          latencyMs: mlLatency,
          details: mlDetails,
        },
        gateway: {
          name: 'Express API Gateway',
          status: 'healthy',
          uptimeSeconds: uptimeSec,
          memoryMb: Math.round(mem.rss / 1024 / 1024),
          nodeVersion: process.version,
          environment: process.env.NODE_ENV || 'development',
        },
      },
    },
  });
});

/** GET /api/admin/audit-logs */
const getAuditLogs = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS total FROM audit_logs');
  const total = countRows[0]?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const { rows } = await pool.query(
    `SELECT id, user_id, admin_email, action, target_type, target_id, details, created_at
       FROM audit_logs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  res.json({
    success: true,
    message: 'Audit logs retrieved.',
    data: {
      logs: rows.map((r) => ({
        id: r.id,
        adminEmail: r.admin_email,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        details: r.details,
        timestamp: new Date(r.created_at).toISOString(),
      })),
      total,
      page,
      limit,
      totalPages,
    },
  });
});

module.exports = {
  getStats,
  getUsers,
  getUserDetails,
  getUserPredictions,
  updateUserStatus,
  deleteUser,
  getPredictions,
  getActivities,
  getSystemHealth,
  getAuditLogs,
};
