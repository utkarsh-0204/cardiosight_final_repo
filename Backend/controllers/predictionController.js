// =============================================================================
// Prediction & history controller.
// =============================================================================
const pool = require("../config/db");
const { asyncHandler, HttpError } = require("../middleware/errorHandler");
const mlService = require("../services/mlService");
const ecgService = require("../services/ecgService");
const tmtService = require("../services/tmtService");

// ---------------------------------------------------------------------------
// Framingham validation
// ---------------------------------------------------------------------------

/*
  Framingham dataset features:

  male
  age
  education
  currentSmoker
  cigsPerDay
  BPMeds
  prevalentStroke
  prevalentHyp
  diabetes
  totChol
  sysBP
  diaBP
  BMI
  heartRate
  glucose
*/

const NUMBER_RANGES = {
  male: [0, 1],
  age: [18, 100],
  education: [1, 4],
  currentSmoker: [0, 1],
  cigsPerDay: [0, 100],
  BPMeds: [0, 1],
  prevalentStroke: [0, 1],
  prevalentHyp: [0, 1],
  diabetes: [0, 1],
  totChol: [80, 400],
  sysBP: [70, 260],
  diaBP: [40, 160],
  BMI: [10, 70],
  heartRate: [35, 220],
  glucose: [40, 400],
};

function isNumberInRange(value, min, max) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Validates and normalizes Framingham PredictionInput.
 */
function validatePredictionInput(body) {
  if (!body || typeof body !== "object") {
    throw new HttpError(400, "Prediction input is required.");
  }

  const clean = {};

  // Validate every Framingham feature
  for (const [key, [min, max]] of Object.entries(NUMBER_RANGES)) {
    if (!isNumberInRange(body[key], min, max)) {
      throw new HttpError(
        400,
        `Invalid ${key}: expected a number between ${min} and ${max}.`
      );
    }

    clean[key] = body[key];
  }

  // Diastolic BP must be lower than systolic BP
  if (clean.diaBP >= clean.sysBP) {
    throw new HttpError(
      400,
      "Diastolic blood pressure must be lower than systolic blood pressure."
    );
  }

  // If user is not a smoker, cigarettes/day should be zero.
  if (clean.currentSmoker === 0) {
    clean.cigsPerDay = 0;
  }

  return clean;
}

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

/**
 * DB row -> PredictionResult
 * POST /api/predict
 * GET  /api/predict/:id
 */
function serializeResult(row) {
  const input = row.input || {};
  return {
    id: row.id,
    riskScore: Number(row.risk_score),
    riskLevel: row.risk_level,
    confidence: Number(row.confidence),
    diseaseProbability: Number(row.probability),
    recommendations: row.recommendations || [],
    contributingFactors: row.contributing_factors || [],
    input: input,
    ecg: input.ecg || null,
    tmt: input.tmt || null,
    submittedAt: new Date(row.created_at).toISOString(),
  };
}

/**
 * DB row -> PredictionRecord
 * Used by prediction history.
 */
function serializeRecord(row) {
  const input = row.input || {};

  return {
    id: row.id,
    patientId: row.user_id,
    patientName: `${row.first_name} ${row.last_name}`,

    age: input.age,
    gender: input.male === 1 ? "male" : "female",

    riskScore: Number(row.risk_score),
    riskLevel: row.risk_level,
    confidence: Number(row.confidence),

    submittedAt: new Date(row.created_at).toISOString(),

    status: row.status,
    input,
  };
}

// ---------------------------------------------------------------------------
// Common SQL query
// ---------------------------------------------------------------------------

const RECORD_SELECT = `
  SELECT
    p.id,
    p.user_id,
    p.prediction,
    p.risk_level,
    p.risk_score,
    p.confidence,
    p.probability,
    p.status,
    p.input,
    p.recommendations,
    p.contributing_factors,
    p.created_at,
    u.first_name,
    u.last_name
  FROM predictions p
  JOIN users u ON u.id = p.user_id
`;

// ---------------------------------------------------------------------------
// Create Prediction
// ---------------------------------------------------------------------------

/**
 * POST /api/predict
 */
const createPrediction = asyncHandler(async (req, res) => {
  // Clinical RBAC enforcement:
  // Administrators cannot create clinical patient predictions under their administrative account.
  if (req.user && req.user.role === 'admin') {
    throw new HttpError(403, 'Forbidden: Administrators cannot create clinical predictions in the patient workflow.');
  }

  // 1. Validate Framingham input
  const input = validatePredictionInput(req.body);

  // 2. Process optional ECG investigation if provided
  let ecgFindings = null;
  if (req.body.ecg && typeof req.body.ecg === 'object' && Object.keys(req.body.ecg).length > 0) {
    try {
      ecgFindings = ecgService.evaluateEcgFindings(req.body.ecg);
    } catch (err) {
      console.warn('ECG evaluation failed; continuing without blocking Framingham prediction:', err.message);
      ecgFindings = {
        status: 'error',
        warnings: ['ECG evaluation error: ' + err.message],
      };
    }
  }

  // 3. Process optional TMT investigation if provided
  let tmtFindings = null;
  if (req.body.tmt && typeof req.body.tmt === 'object' && Object.keys(req.body.tmt).length > 0) {
    try {
      tmtFindings = await tmtService.analyzeTmt({
        ...req.body.tmt,
        age: req.body.tmt.age != null && req.body.tmt.age !== '' ? Number(req.body.tmt.age) : input.age,
        sex: req.body.tmt.sex != null && req.body.tmt.sex !== '' ? Number(req.body.tmt.sex) : input.male,
      });
    } catch (err) {
      console.warn('TMT analysis failed; continuing without blocking Framingham prediction:', err.message);
      tmtFindings = {
        status: 'error',
        warnings: ['TMT analysis error: ' + err.message],
      };
    }
  }

  // 4. Send Framingham input to ML service
  const result = await mlService.predict(input);

  // 5. Resolve patient
  let patientId = null;

  const { rows: patientRows } = await pool.query(
    "SELECT id FROM patients WHERE user_id = $1",
    [req.user.id]
  );

  if (patientRows.length > 0) {
    patientId = patientRows[0].id;
  } else {
    const { rows: created } = await pool.query(
      "INSERT INTO patients (user_id) VALUES ($1) RETURNING id",
      [req.user.id]
    );

    patientId = created[0].id;
  }

  // 6. Build stored input with optional investigation payloads
  const storedInput = {
    ...input,
  };
  if (ecgFindings) {
    storedInput.ecg = ecgFindings;
  }
  if (tmtFindings) {
    storedInput.tmt = tmtFindings;
  }

  // 7. Save prediction
  const { rows } = await pool.query(
    `INSERT INTO predictions
       (
         user_id,
         patient_id,
         prediction,
         risk_level,
         risk_score,
         confidence,
         probability,
         status,
         input,
         recommendations,
         contributing_factors
       )
     VALUES
       (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7,
         'completed',
         $8,
         $9,
         $10
       )
     RETURNING *`,
    [
      req.user.id,
      patientId,

      result.riskLevel,
      result.riskLevel,

      result.riskScore,
      result.confidence,
      result.diseaseProbability,

      JSON.stringify(storedInput),
      JSON.stringify(result.recommendations),
      JSON.stringify(result.contributingFactors),
    ]
  );

  // 5. Return result
  res.status(201).json({
    success: true,
    message: "Prediction completed.",
    data: serializeResult(rows[0]),
  });
});

// ---------------------------------------------------------------------------
// Get Single Prediction
// ---------------------------------------------------------------------------

/**
 * GET /api/predict/:id
 */
const getPrediction = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM predictions WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "Prediction not found.");
  }

  const record = rows[0];
  const isAdmin = String(req.user.role || '').toLowerCase().trim() === 'admin';
  if (record.user_id !== req.user.id && !isAdmin) {
    throw new HttpError(403, "Forbidden: You do not have permission to access this prediction record.");
  }

  // Audit logging for administrative inspection of patient prediction
  if (isAdmin && record.user_id !== req.user.id) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (user_id, admin_email, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          req.user.email || 'admin@cardiosight.local',
          'ADMIN_VIEW_PATIENT_PREDICTION',
          'prediction',
          record.id,
          JSON.stringify({ patientId: record.user_id, riskScore: record.risk_score, riskLevel: record.risk_level })
        ]
      );
    } catch (auditErr) {
      console.warn('[predictionController] Failed to record audit log:', auditErr.message);
    }
  }

  res.json({
    success: true,
    message: "Prediction retrieved.",
    data: serializeResult(record),
  });
});

// ---------------------------------------------------------------------------
// Get Prediction Explanation (XAI via SHAP)
// ---------------------------------------------------------------------------

// In-flight explanation promises to prevent duplicate concurrent calculations
const inFlightExplanations = new Map();

/**
 * GET /api/predict/:id/explain
 */
const getPredictionExplanation = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT * FROM predictions WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "Prediction not found.");
  }

  const predictionRecord = rows[0];
  const isAdmin = String(req.user.role || '').toLowerCase().trim() === 'admin';
  if (predictionRecord.user_id !== req.user.id && !isAdmin) {
    throw new HttpError(403, "Forbidden: You do not have permission to access this prediction record.");
  }

  // 1. Check if explanation is already cached in database
  if (predictionRecord.explanation && typeof predictionRecord.explanation === 'object') {
    return res.json({
      success: true,
      message: "Prediction explanation retrieved.",
      data: {
        predictionId: predictionRecord.id,
        submittedAt: new Date(predictionRecord.created_at).toISOString(),
        ...predictionRecord.explanation,
      },
    });
  }

  // 2. Prevent duplicate concurrent requests using in-flight promise registry
  const cacheKey = `${predictionRecord.id}`;
  let explainPromise = inFlightExplanations.get(cacheKey);

  if (!explainPromise) {
    const input = predictionRecord.input || {};
    explainPromise = (async () => {
      const explanation = await mlService.explain(input);

      // Asynchronously cache valid explanation to PostgreSQL
      try {
        await pool.query(
          "UPDATE predictions SET explanation = $1 WHERE id = $2",
          [JSON.stringify(explanation), predictionRecord.id]
        );
      } catch (cacheErr) {
        console.warn("[predictionController] Failed to persist explanation cache:", cacheErr.message);
      }

      return explanation;
    })();

    inFlightExplanations.set(cacheKey, explainPromise);
  }

  try {
    const explanation = await explainPromise;

    res.json({
      success: true,
      message: "Prediction explanation retrieved.",
      data: {
        predictionId: predictionRecord.id,
        submittedAt: new Date(predictionRecord.created_at).toISOString(),
        ...explanation,
      },
    });
  } finally {
    inFlightExplanations.delete(cacheKey);
  }
});

// ---------------------------------------------------------------------------
// Prediction History
// ---------------------------------------------------------------------------

/**
 * GET /api/history
 */
const listHistory = asyncHandler(async (req, res) => {
  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);

  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(req.query.pageSize, 10) || 10)
  );

  const search = String(req.query.search || "").trim();

  const risk = String(req.query.risk || "all");

  const sortBy = String(req.query.sortBy || "submittedAt");

  const sortDir =
    String(req.query.sortDir || "desc").toLowerCase() === "asc"
      ? "ASC"
      : "DESC";

  const conditions = ["p.user_id = $1"];

  const values = [req.user.id];

  // Search
  if (search) {
    conditions.push(
      `(p.id::text ILIKE $${values.length + 1}
        OR CONCAT(u.first_name, ' ', u.last_name)
           ILIKE $${values.length + 1}
        OR p.risk_score::text
           ILIKE $${values.length + 1})`
    );

    values.push(`%${search}%`);
  }

  // Risk filter
  if (risk && risk !== "all") {
    conditions.push(`p.risk_level = $${values.length + 1}`);

    values.push(risk);
  }

  // Whitelisted sortable columns
  const sortColumns = {
    submittedAt: "p.created_at",
    riskScore: "p.risk_score",
    age: "(p.input->>'age')::int",
    confidence: "p.confidence",
  };

  const orderBy = sortColumns[sortBy] || sortColumns.submittedAt;

  const where = `
    WHERE ${conditions.join(" AND ")}
  `;

  // Count total records
  const countValues = [...values];

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM predictions p
     JOIN users u ON u.id = p.user_id
     ${where}`,
    countValues
  );

  const total = countRows[0].total;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const safePage = Math.min(page, totalPages);

  const offset = (safePage - 1) * pageSize;

  // Fetch history
  const { rows } = await pool.query(
    `${RECORD_SELECT}
     ${where}
     ORDER BY ${orderBy} ${sortDir}
     LIMIT $${values.length + 1}
     OFFSET $${values.length + 2}`,
    [...values, pageSize, offset]
  );

  res.json({
    success: true,
    message: "History retrieved.",

    data: {
      items: rows.map(serializeRecord),

      total,
      page: safePage,
      pageSize,
      totalPages,
    },
  });
});

// ---------------------------------------------------------------------------
// Get History Item
// ---------------------------------------------------------------------------

/**
 * GET /api/history/:id
 */
const getHistoryItem = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `${RECORD_SELECT} WHERE p.id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "Prediction not found.");
  }

  const record = rows[0];
  const isAdmin = String(req.user.role || '').toLowerCase().trim() === 'admin';
  if (record.user_id !== req.user.id && !isAdmin) {
    throw new HttpError(403, "Forbidden: You do not have permission to access this prediction record.");
  }

  // Audit logging for administrative inspection of patient prediction
  if (isAdmin && record.user_id !== req.user.id) {
    try {
      await pool.query(
        `INSERT INTO audit_logs (user_id, admin_email, action, target_type, target_id, details)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.user.id,
          req.user.email || 'admin@cardiosight.local',
          'ADMIN_VIEW_PATIENT_PREDICTION',
          'prediction',
          record.id,
          JSON.stringify({ patientId: record.user_id, riskScore: record.risk_score, riskLevel: record.risk_level })
        ]
      );
    } catch (auditErr) {
      console.warn('[predictionController] Failed to record audit log:', auditErr.message);
    }
  }

  res.json({
    success: true,
    message: "Prediction retrieved.",
    data: serializeRecord(record),
  });
});

// ---------------------------------------------------------------------------
// Delete History Item
// ---------------------------------------------------------------------------

/**
 * DELETE /api/history/:id
 */
const deleteHistoryItem = asyncHandler(async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, user_id FROM predictions WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    throw new HttpError(404, "Prediction not found.");
  }

  const record = rows[0];
  const isAdmin = String(req.user.role || '').toLowerCase().trim() === 'admin';
  if (record.user_id !== req.user.id && !isAdmin) {
    throw new HttpError(403, "Forbidden: You do not have permission to delete this prediction record.");
  }

  await pool.query(
    `DELETE FROM predictions WHERE id = $1`,
    [req.params.id]
  );

  res.json({
    success: true,
    message: "Prediction record deleted.",
    data: { id: req.params.id },
  });
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  createPrediction,
  getPrediction,
  getPredictionExplanation,
  listHistory,
  getHistoryItem,
  deleteHistoryItem,
  serializeResult,
  serializeRecord,
  RECORD_SELECT,
};
