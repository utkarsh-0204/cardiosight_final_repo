// =============================================================================
// ML communication service.
// Sends Framingham inputs to the Django/scikit-learn ML server.
// =============================================================================

const axios = require("axios");

const ML_URL = (process.env.ML_SERVER_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

const ML_PREDICT_URL = `${ML_URL}/api/predict`;

// ---------------------------------------------------------------------------
// Framingham factors
// ---------------------------------------------------------------------------

function buildFactors(input) {
  const factors = [];

  if (input.age >= 55) {
    factors.push({
      factor: "Age",
      impact: 0.8,
      severity: "high",
      label: "Age",
      detail: `${input.age} years`,
    });
  }

  if (input.currentSmoker === 1) {
    factors.push({
      factor: "Smoking",
      impact: 0.9,
      severity: "high",
      label: "Current smoker",
      detail: `${input.cigsPerDay} cigarettes/day`,
    });
  }

  if (input.sysBP >= 140) {
    factors.push({
      factor: "Blood pressure",
      impact: 0.9,
      severity: "high",
      label: "Systolic BP",
      detail: `${input.sysBP} mmHg`,
    });
  }

  if (input.totChol >= 240) {
    factors.push({
      factor: "Cholesterol",
      impact: 0.8,
      severity: "high",
      label: "Total cholesterol",
      detail: `${input.totChol} mg/dL`,
    });
  }

  if (input.diabetes === 1) {
    factors.push({
      factor: "Diabetes",
      impact: 0.9,
      severity: "high",
      label: "Diabetes",
      detail: "Present",
    });
  }

  if (input.BMI >= 30) {
    factors.push({
      factor: "BMI",
      impact: 0.6,
      severity: "medium",
      label: "Body mass index",
      detail: Number(input.BMI).toFixed(1),
    });
  }

  if (input.prevalentStroke === 1) {
    factors.push({
      factor: "Stroke history",
      impact: 0.9,
      severity: "high",
      label: "Previous stroke",
      detail: "Present",
    });
  }

  if (input.prevalentHyp === 1) {
    factors.push({
      factor: "Hypertension",
      impact: 0.8,
      severity: "high",
      label: "Hypertension",
      detail: "Present",
    });
  }

  if (input.glucose >= 126) {
    factors.push({
      factor: "Glucose",
      impact: 0.7,
      severity: "high",
      label: "Blood glucose",
      detail: `${input.glucose} mg/dL`,
    });
  }

  return factors.slice(0, 6);
}

// ---------------------------------------------------------------------------
// Recommendations
// ---------------------------------------------------------------------------

function buildRecommendations(input, level) {
  const recommendations = [];

  if (level === "high") {
    recommendations.push(
      "Consult a healthcare professional for a cardiovascular evaluation."
    );
  } else if (level === "medium") {
    recommendations.push("Schedule a preventive cardiovascular check-up.");
  }

  recommendations.push(
    "Maintain regular physical activity and a heart-healthy diet."
  );

  if (input.currentSmoker === 1) {
    recommendations.push("Consider a smoking-cessation program.");
  }

  if (input.sysBP >= 140 || input.prevalentHyp === 1) {
    recommendations.push("Monitor your blood pressure regularly.");
  }

  if (input.totChol >= 200) {
    recommendations.push(
      "Discuss your cholesterol levels with a healthcare professional."
    );
  }

  if (input.diabetes === 1 || input.glucose >= 126) {
    recommendations.push(
      "Monitor blood glucose and discuss diabetes management with a healthcare professional."
    );
  }

  if (input.BMI >= 30) {
    recommendations.push(
      "Discuss healthy weight management with a healthcare professional."
    );
  }

  return [...new Set(recommendations)].slice(0, 6);
}

// ---------------------------------------------------------------------------
// Prediction
// ---------------------------------------------------------------------------

async function predict(input) {
  try {
    const { data } = await axios.post(
      ML_PREDICT_URL,
      {
        features: input,
      },
      {
        timeout: 15000,
      }
    );

    if (!data || data.success !== true) {
      throw new Error(
        data?.message || "ML server returned an invalid response."
      );
    }

    const probability = Number(data.probability);
    const riskScore = Number(data.risk_score);

    const riskLevel =
  probability >= 60 ? "high" : probability >= 35 ? "medium" : "low";

    return {
      riskScore: Math.round(riskScore),

      riskLevel,

      confidence: Math.round(Number(data.confidence ?? 0)),

      diseaseProbability: Math.round(probability),

      recommendations: buildRecommendations(input, riskLevel),

      contributingFactors: buildFactors(input),
    };
  } catch (err) {
    console.error(
      `[mlService] ML prediction failed at ${ML_PREDICT_URL}:`,
      err.message
    );

    // IMPORTANT:
    // Do NOT fall back to the old synthetic algorithm.
    // CardioSight must use the trained Framingham model.

    throw new Error(
      "ML prediction service is unavailable. Please make sure the Django ML server is running."
    );
  }
}

const ML_EXPLAIN_URL = `${ML_URL}/api/explain`;

const FRAMINGHAM_FEATURE_KEYS = [
  "male", "age", "education", "currentSmoker", "cigsPerDay",
  "BPMeds", "prevalentStroke", "prevalentHyp", "diabetes",
  "totChol", "sysBP", "diaBP", "BMI", "heartRate", "glucose"
];

function extractFraminghamFeatures(input) {
  const clean = {};
  for (const key of FRAMINGHAM_FEATURE_KEYS) {
    if (input && input[key] !== undefined && input[key] !== null) {
      clean[key] = input[key];
    }
  }
  return clean;
}

async function explain(input) {
  try {
    const framinghamFeatures = extractFraminghamFeatures(input);
    const { data } = await axios.post(
      ML_EXPLAIN_URL,
      {
        features: framinghamFeatures,
      },
      {
        timeout: 10000,
      }
    );

    if (!data || data.success !== true) {
      throw new Error(
        data?.message || "ML server returned an invalid explanation response."
      );
    }

    return data.data;
  } catch (err) {
    console.error(
      `[mlService] ML explanation failed at ${ML_EXPLAIN_URL}:`,
      err.message
    );
    const errorMsg =
      err.code === "ECONNABORTED" || (err.message && err.message.includes("timeout"))
        ? "SHAP explanation calculation timed out. Please retry."
        : err.response?.data?.message ||
          "ML explanation service is temporarily unavailable. Please make sure the Django ML server is running.";
    const error = new Error(errorMsg);
    error.status = 503;
    throw error;
  }
}

module.exports = {
  predict,
  explain,
  extractFraminghamFeatures,
};
