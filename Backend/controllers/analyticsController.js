// =============================================================================
// Analytics controller – platform-wide chart data.
// Protected by requireRole('admin').
// =============================================================================
const pool = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AGE_BUCKETS = [
  { range: '18-30', min: 18, max: 30 },
  { range: '31-40', min: 31, max: 40 },
  { range: '41-50', min: 41, max: 50 },
  { range: '51-60', min: 51, max: 60 },
  { range: '60+', min: 61, max: 999 },
];

function isMaleInput(input) {
  if (!input) return false;
  if (input.male === 1 || input.male === '1' || input.male === true) return true;
  if (typeof input.gender === 'string' && input.gender.toLowerCase() === 'male') return true;
  return false;
}

function isFemaleInput(input) {
  if (!input) return false;
  if (input.male === 0 || input.male === '0' || input.male === false) return true;
  if (typeof input.gender === 'string' && input.gender.toLowerCase() === 'female') return true;
  return false;
}

/** GET /api/analytics */
const getAnalytics = asyncHandler(async (req, res) => {
  const { rows: preds } = await pool.query(
    `SELECT risk_level, risk_score, input, created_at FROM predictions ORDER BY created_at ASC`
  );
  const { rows: userCount } = await pool.query('SELECT COUNT(*)::int AS c FROM users');

  const total = preds.length;
  const high = preds.filter((r) => r.risk_level === 'high').length;
  const medium = preds.filter((r) => r.risk_level === 'medium').length;
  const low = preds.filter((r) => r.risk_level === 'low').length;
  const avgRisk = total ? Math.round(preds.reduce((s, r) => s + Number(r.risk_score || 0), 0) / total) : 0;

  // Accurate gender distribution: check male binary indicator (Framingham convention) and gender string
  let male = 0;
  let female = 0;
  let otherGender = 0;

  for (const r of preds) {
    const inp = r.input || {};
    if (isMaleInput(inp)) {
      male += 1;
    } else if (isFemaleInput(inp)) {
      female += 1;
    } else {
      otherGender += 1;
    }
  }

  const genderDistribution = [
    { label: 'Male', value: male },
    { label: 'Female', value: female },
  ];
  if (otherGender > 0) {
    genderDistribution.push({ label: 'Other / Unspecified', value: otherGender });
  }

  // Age distribution by clinical brackets
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

  // Monthly predictions for the past 6 months
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
    message: 'Analytics retrieved.',
    data: {
      totalPredictions: total,
      totalUsers: userCount[0].c,
      avgRiskScore: avgRisk,
      highRiskRate: total ? Math.round((high / total) * 100) : 0,
      riskDistribution: [
        { label: 'Low risk', value: low, color: '#43A047' },
        { label: 'Medium risk', value: medium, color: '#F9A825' },
        { label: 'High risk', value: high, color: '#E53935' },
      ],
      genderDistribution,
      ageDistribution,
      monthlyPredictions,
    },
  });
});

module.exports = { getAnalytics, isMaleInput, isFemaleInput };
