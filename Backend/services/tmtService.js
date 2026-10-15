// =============================================================================
// TMT (Treadmill Test) Service
// Parses exercise stress test reports, computes Duke Treadmill Score (DTS),
// and coordinates with the Django ML service for UCI CAD inference.
// Does NOT mix ECG logic or use Framingham risk inputs.
// =============================================================================

const axios = require('axios');

const ML_URL = (process.env.ML_SERVER_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const ML_TMT_URL = `${ML_URL}/api/predict-tmt`;

/**
 * Checks if a string represents an unprovided/missing template placeholder.
 * @param {string} str
 */
function isUnprovided(str) {
  if (!str || typeof str !== 'string') return true;
  return /^(?:not\s+(?:provided|specified|available|calculated|applicable)|n\/?a|none(?:\s+reported)?|nil|unspecified|blank|[-_—\s]+)$/i.test(str.trim());
}

/**
 * Cleans report text to normalize newlines and strip form underscores.
 * @param {string} text
 */
function cleanReportText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/_{3,}/g, '')
    .trim();
}

/**
 * Parses exercise duration into total decimal minutes.
 * Supports:
 * - "Exercise duration (minutes): 8.5"
 * - "Total exercise duration: 08:30" (MM:SS)
 * - "Duration: 8 min 45 sec"
 * - "9.0 minutes"
 * @param {string} text
 */
function parseExerciseDuration(text) {
  const lineMatch = text.match(/(?:exercise\s+time|total\s+(?:exercise\s+)?duration|duration|exercise\s+duration)\s*(?:\([^)]*\))?\s*[:=]?\s*(?:(\d{1,2}):(\d{2})|(\d{1,2}(?:\.\d{1,2})?)\s*(?:min(?:ute)?s?)?(?:\s*(\d{1,2})\s*sec)?)/i);
  if (!lineMatch) return null;

  // Format MM:SS
  if (lineMatch[1] !== undefined && lineMatch[2] !== undefined) {
    const mins = Number.parseInt(lineMatch[1], 10);
    const secs = Number.parseInt(lineMatch[2], 10);
    const total = Number((mins + secs / 60).toFixed(1));
    return Number.isFinite(total) && total > 0 && total <= 60 ? total : null;
  }

  // Format X.Y min or X min Y sec
  if (lineMatch[3] !== undefined) {
    const mins = Number.parseFloat(lineMatch[3]);
    const secs = lineMatch[4] ? Number.parseInt(lineMatch[4], 10) : 0;
    const total = Number((mins + secs / 60).toFixed(1));
    return Number.isFinite(total) && total > 0 && total <= 60 ? total : null;
  }

  return null;
}

/**
 * Parses peak/maximum heart rate achieved during exercise stress (thalach).
 * Matches:
 * "Maximum heart rate achieved (bpm): 154", "Max HR Achieved: 156 bpm",
 * "Peak Heart Rate: 160", "Thalach: 148", "Max HR achieved 150"
 * Does NOT match "Maximum heart rate achieved (bpm) Not provided"
 * @param {string} text
 */
function parsePeakHeartRate(text) {
  const re = /(?:max(?:imum)?\s+(?:heart\s+rate|hr)(?:\s+achieved)?|peak\s+(?:heart\s+rate|hr)|thalach|max\s+hr\s+achieved)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{2,3})(?!\d)/i;
  const match = text.match(re);
  if (!match) return null;

  const num = Number.parseInt(match[1], 10);
  if (Number.isFinite(num) && num >= 40 && num <= 250) {
    return num;
  }
  return null;
}

/**
 * Parses resting heart rate from TMT report.
 * @param {string} text
 */
function parseRestingHeartRate(text) {
  const re = /(?:rest(?:ing)?\s+(?:heart\s+rate|hr)|basal\s+hr)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{2,3})(?!\d)/i;
  const match = text.match(re);
  if (!match) return null;

  const num = Number.parseInt(match[1], 10);
  if (Number.isFinite(num) && num >= 35 && num <= 200) {
    return num;
  }
  return null;
}

/**
 * Parses target heart rate achieved percentage.
 * @param {string} text
 */
function parseTargetHrPercent(text) {
  const re = /(?:target\s+(?:hr|heart\s+rate)\s*(?:achieved)?|%\s*of\s*target\s*hr|%\s*target|%\s*mphr|%\s*of\s*age-predicted\s*max(?:imum)?)\s*[:=]?\s*(\d{2,3})\s*%/i;
  let match = text.match(re);
  if (!match) {
    match = text.match(/(\d{2,3})%\s*(?:of\s*(?:age-predicted\s*)?max(?:imum)?|\s*target\s*hr|mphr)/i);
  }
  if (!match) return null;

  const num = Number.parseInt(match[1], 10);
  return Number.isFinite(num) && num >= 30 && num <= 150 ? num : null;
}

/**
 * Parses METs (Metabolic Equivalents of Task) achieved.
 * Matches:
 * "METs achieved: 10.5", "Workload: 10.2 METs", "Functional capacity: 9.0 METs", "METs achieved 10.2"
 * @param {string} text
 */
function parseMets(text) {
  const re = /(?:workload|mets?\s*(?:achieved)?|functional\s+capacity)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:mets?)?/i;
  const match = text.match(re);
  if (!match) return null;

  const num = Number.parseFloat(match[1]);
  return Number.isFinite(num) && num >= 1.0 && num <= 30.0 ? num : null;
}

/**
 * Parses exercise-induced angina (exang: 0 = No, 1 = Yes).
 * Returns null if not provided or unmentioned.
 * @param {string} text
 */
function parseExerciseAngina(text) {
  const lineMatch = text.match(/(?:exercise[\s-]?(?:induced\s+)?angina|angina)\s*(?:\([^)]*\))?\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    if (/(?:yes|present|positive|induced|experienced|limiting)/i.test(raw)) return 1;
    if (/(?:no|absent|negative|denies|none)/i.test(raw)) return 0;
  }

  // Check template line without colon e.g. "Exercise-induced angina Not provided"
  const templateMatch = text.match(/(?:exercise[\s-]?(?:induced\s+)?angina)\s+([^\n\r]+)/i);
  if (templateMatch && isUnprovided(templateMatch[1])) {
    return null;
  }

  if (/(?:chest\s+pain|angina)\s+(?:during|induced\s+by)\s+exercise/i.test(text)) return 1;
  if (/no\s+(?:angina|chest\s+pain)/i.test(text) || /negative\s+for\s+(?:angina|chest\s+pain)/i.test(text)) return 0;

  return null;
}

/**
 * Parses peak ST depression relative to rest (oldpeak in mm).
 * Returns null if not provided.
 * @param {string} text
 */
function parseStDepression(text) {
  const lineMatch = text.match(/(?:st[\s-]?(?:segment\s+)?depression|peak\s+st\s+depression|\boldpeak\b)\s*(?:\([^)]*\))?\s*[:=]?\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    const numMatch = raw.match(/(\d{1,2}(?:\.\d{1,2})?)/);
    if (numMatch) {
      const num = Number.parseFloat(numMatch[1]);
      return Number.isFinite(num) && num >= 0.0 && num <= 10.0 ? num : null;
    }
    if (/no(?:ne)?|absent|nil|zero/i.test(raw)) return 0.0;
  }

  // Check for explicit "no ST depression" on a single line
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/\b(?:no|nil|zero)\s+st[\s-]?(?:segment\s+)?depression\b/i.test(line)) {
      return 0.0;
    }
  }

  return null;
}

/**
 * Parses peak ST segment slope (slope: 1 = Upsloping, 2 = Flat / Horizontal, 3 = Downsloping).
 * Returns null if not provided.
 * @param {string} text
 */
function parsePeakStSlope(text) {
  const lineMatch = text.match(/(?:peak\s+st[\s-]?(?:segment\s+)?slope|st\s+slope|\bslope\b)\s*(?:\([^)]*\))?\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    if (/down[\s-]?sloping|3/i.test(raw)) return 3;
    if (/flat|horizontal|2/i.test(raw)) return 2;
    if (/up[\s-]?sloping|1/i.test(raw)) return 1;
  }

  const templateMatch = text.match(/(?:peak\s+st[\s-]?(?:segment\s+)?slope)\s+([^\n\r]+)/i);
  if (templateMatch && isUnprovided(templateMatch[1])) return null;

  if (/down[\s-]?sloping/i.test(text)) return 3;
  if (/flat|horizontal/i.test(text)) return 2;
  if (/up[\s-]?sloping/i.test(text)) return 1;

  return null;
}

/**
 * Parses resting ECG finding (restecg: 0 = Normal, 1 = ST-T abnormality, 2 = LVH).
 * Returns null if not provided.
 * @param {string} text
 */
function parseRestingEcg(text) {
  const lineMatch = text.match(/(?:resting\s+ecg(?:\s+finding)?|restecg)\s*(?:\([^)]*\))?\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    if (/left\s+ventricular\s+hypertrophy|lvh|2/i.test(raw)) return 2;
    if (/st[\s-]?t\s+(?:wave\s+)?abnormal|t-?wave\s+changes|1/i.test(raw)) return 1;
    if (/normal|wnl|0/i.test(raw)) return 0;
  }

  const templateMatch = text.match(/(?:resting\s+ecg\s+finding)\s+([^\n\r]+)/i);
  if (templateMatch && isUnprovided(templateMatch[1])) return null;

  if (/left\s+ventricular\s+hypertrophy|\blvh\b/i.test(text)) return 2;
  if (/st[\s-]?t\s+(?:wave\s+)?abnormal/i.test(text)) return 1;
  if (/resting\s+ecg\s*[:=]?\s*normal/i.test(text)) return 0;

  return null;
}

/**
 * Parses reported treadmill stress conclusion / diagnosis.
 * Strips template boilerplates and disclaimers.
 * @param {string} text
 */
function parseConclusion(text) {
  const concMatch = text.match(/(?:reported\s+exercise\s+conclusion\s*\/?\s*diagnosis|conclusion|impression|final\s+result|summary)\s*[:=]\s*([^\n\r]+)/i);
  if (concMatch && concMatch[1]) {
    const raw = concMatch[1].trim().replace(/^[:=\s]+/, '');
    if (!isUnprovided(raw)) {
      const clean = raw.split(/\b(?:Clinical note|This report template|Signed by)\b/i)[0].trim();
      if (clean && !isUnprovided(clean)) {
        return clean;
      }
    }
  }
  return null;
}

/**
 * Parses protocol if stated in report.
 * @param {string} text
 */
function parseProtocol(text) {
  if (/modified\s+bruce/i.test(text)) return 'Modified Bruce';
  if (/bruce/i.test(text)) return 'Standard Bruce';
  if (/naughton/i.test(text)) return 'Naughton';
  if (/balke/i.test(text)) return 'Balke';
  return null;
}

/**
 * Parses raw text from a TMT report and extracts structured exercise stress parameters.
 * @param {string} text
 */
function parseTmtText(text) {
  if (!text || typeof text !== 'string') {
    return {
      extractionStatus: 'empty',
      fields: getEmptyFields(),
      reportedConclusion: null,
      summary: null,
      warnings: ['No readable text found in TMT report.']
    };
  }

  const cleanText = cleanReportText(text);

  // 1. Peak Heart Rate / Maximum HR Achieved (thalach)
  const peakHr = parsePeakHeartRate(cleanText);

  // 2. Resting Heart Rate
  const restingHr = parseRestingHeartRate(cleanText);

  // 3. Target Heart Rate Achieved (%)
  const targetHrPercent = parseTargetHrPercent(cleanText);

  // 4. METs Achieved
  const mets = parseMets(cleanText);

  // 5. Exercise Duration (minutes)
  const exerciseDurationMinutes = parseExerciseDuration(cleanText);

  // 6. Exercise-Induced Angina (exang: 0 = No, 1 = Yes, null = not found)
  const exang = parseExerciseAngina(cleanText);

  // 7. Peak ST Depression (oldpeak in mm)
  const oldpeak = parseStDepression(cleanText);

  // 8. ST Slope (1 = upsloping, 2 = flat, 3 = downsloping, null = not found)
  const slope = parsePeakStSlope(cleanText);

  // 9. Resting ECG (restecg: 0 = normal, 1 = ST-T abnormality, 2 = LVH, null = not found)
  const restecg = parseRestingEcg(cleanText);

  // 10. Exercise Protocol
  const protocol = parseProtocol(cleanText);

  // 11. Reported Conclusion / Diagnosis
  const conclusion = parseConclusion(cleanText);

  const durationField = {
    value: exerciseDurationMinutes,
    unit: 'minutes',
    status: exerciseDurationMinutes !== null ? 'extracted' : 'not_found'
  };

  const restingHrField = {
    value: restingHr,
    unit: 'bpm',
    status: restingHr !== null ? 'extracted' : 'not_found'
  };

  const fields = {
    thalach: {
      value: peakHr,
      unit: 'bpm',
      status: peakHr !== null ? 'extracted' : 'not_found'
    },
    restingHr: restingHrField,
    restingHR: restingHrField,
    targetHrPercent: {
      value: targetHrPercent,
      unit: '%',
      status: targetHrPercent !== null ? 'extracted' : 'not_found'
    },
    mets: {
      value: mets,
      unit: 'METs',
      status: mets !== null ? 'extracted' : 'not_found'
    },
    exerciseDurationMinutes: durationField,
    durationMinutes: durationField,
    exang: {
      value: exang,
      unit: '',
      status: exang !== null ? 'extracted' : 'not_found'
    },
    oldpeak: {
      value: oldpeak,
      unit: 'mm',
      status: oldpeak !== null ? 'extracted' : 'not_found'
    },
    slope: {
      value: slope,
      unit: '',
      status: slope !== null ? 'extracted' : 'not_found'
    },
    restecg: {
      value: restecg,
      unit: '',
      status: restecg !== null ? 'extracted' : 'not_found'
    },
    protocol: {
      value: protocol,
      unit: '',
      status: protocol !== null ? 'extracted' : 'not_found'
    },
    conclusion: {
      value: conclusion,
      unit: '',
      status: conclusion !== null ? 'extracted' : 'not_found'
    }
  };

  const coreFieldsList = [
    fields.thalach,
    fields.restingHR,
    fields.targetHrPercent,
    fields.mets,
    fields.durationMinutes,
    fields.exang,
    fields.oldpeak,
    fields.slope,
    fields.restecg,
    fields.conclusion
  ];

  const extractedCount = coreFieldsList.filter(f => f.status === 'extracted').length;

  const warnings = [];
  let extractionStatus = 'empty';

  if (extractedCount === 0) {
    extractionStatus = 'empty';
    warnings.push(
      'This document does not contain any readable exercise stress test measurements or conclusion. It appears to be an unpopulated template. Please manually enter your values.'
    );
  } else if (extractedCount < 3) {
    extractionStatus = 'partial';
    warnings.push(
      'Only partial TMT parameters were automatically extracted. Please verify or manually enter missing values.'
    );
  } else {
    extractionStatus = 'success';
  }

  return {
    extractionStatus,
    fields,
    reportedConclusion: conclusion,
    summary: conclusion,
    warnings
  };
}

function getEmptyFields() {
  const notFound = (unit = '') => ({ value: null, unit, status: 'not_found' });
  const durField = notFound('minutes');
  const hrField = notFound('bpm');

  return {
    thalach: hrField,
    restingHr: hrField,
    restingHR: hrField,
    targetHrPercent: notFound('%'),
    mets: notFound('METs'),
    exerciseDurationMinutes: durField,
    durationMinutes: durField,
    exang: notFound(''),
    oldpeak: notFound('mm'),
    slope: notFound(''),
    restecg: notFound(''),
    protocol: notFound(''),
    conclusion: notFound('')
  };
}

/**
 * Computes the Duke Treadmill Score (DTS):
 * DTS = Exercise Time (min) - (5 x ST depression in mm) - (4 x Angina Index)
 * Angina index: 0 = none, 1 = non-limiting, 2 = exercise-limiting.
 * Categories: >= +5 (Low risk), -10 to +4 (Moderate risk), < -10 (High risk).
 */
function computeDukeScore(durationMin, stDepressionMm, anginaVal) {
  if (durationMin == null || stDepressionMm == null) return null;
  const anginaIndex = anginaVal === 1 ? 1 : 0;
  const dts = Number((durationMin - 5 * stDepressionMm - 4 * anginaIndex).toFixed(1));

  let riskCategory = 'moderate';
  let mortalityRisk = 'Annual cardiovascular mortality ~1.25%';
  if (dts >= 5) {
    riskCategory = 'low';
    mortalityRisk = 'Low risk: 4-year survival > 99% (annual mortality < 0.25%)';
  } else if (dts < -10) {
    riskCategory = 'high';
    mortalityRisk = 'High risk: 4-year survival ~79% (annual mortality > 5%)';
  }

  return {
    score: dts,
    category: riskCategory,
    interpretation: mortalityRisk
  };
}

/**
 * Runs independent inference against Django ML service for UCI CAD model.
 * Does NOT mix with Framingham features or require external patient inputs.
 * @param {object} tmtInput
 */
async function analyzeTmt(tmtInput = {}) {
  const thalach = tmtInput.thalach != null && tmtInput.thalach !== '' ? Number(tmtInput.thalach) : null;
  const exang = tmtInput.exang != null && tmtInput.exang !== '' ? Number(tmtInput.exang) : null;
  const oldpeak = tmtInput.oldpeak != null && tmtInput.oldpeak !== '' ? Number(tmtInput.oldpeak) : null;
  const slope = tmtInput.slope != null && tmtInput.slope !== '' ? Number(tmtInput.slope) : null;
  const restecg = tmtInput.restecg != null && tmtInput.restecg !== '' ? Number(tmtInput.restecg) : null;

  const duration = tmtInput.durationMinutes != null && tmtInput.durationMinutes !== ''
    ? Number(tmtInput.durationMinutes)
    : (tmtInput.exerciseDurationMinutes != null && tmtInput.exerciseDurationMinutes !== '' ? Number(tmtInput.exerciseDurationMinutes) : null);

  // Clinical Duke Treadmill Score (independent of Framingham inputs)
  const rawDukeScore = computeDukeScore(
    duration,
    oldpeak,
    exang
  );

  let dukeTreadmillScore = null;
  if (rawDukeScore) {
    dukeTreadmillScore = {
      score: rawDukeScore.score,
      riskCategory: rawDukeScore.category === 'low' ? 'Low Risk' : (rawDukeScore.category === 'high' ? 'High Risk' : 'Moderate Risk'),
      estimatedAnnualMortality: rawDukeScore.category === 'low' ? '< 0.25%' : (rawDukeScore.category === 'high' ? '> 5%' : '~1.25%'),
      note: rawDukeScore.interpretation
    };
  }

  let mlInference = null;
  let mlError = null;

  // Query UCI TMT model if core exercise stress features are present
  if (thalach !== null && oldpeak !== null) {
    try {
      const response = await axios.post(
        ML_TMT_URL,
        {
          tmt: {
            age: tmtInput.age != null ? Number(tmtInput.age) : null,
            sex: tmtInput.sex != null ? Number(tmtInput.sex) : null,
            restecg: restecg != null ? restecg : 0,
            thalach,
            exang: exang !== null ? exang : 0,
            oldpeak,
            slope: slope !== null ? slope : 2
          }
        },
        { timeout: 8000 }
      );
      if (response.data && response.data.success) {
        mlInference = response.data;
      }
    } catch (err) {
      console.warn(`[tmtService] ML TMT model query failed: ${err.message}`);
      mlError = 'UCI TMT machine learning model inference was unavailable. Clinical criteria used instead.';
    }
  }

  let mlUciStressModel = null;
  if (mlInference && mlInference.success) {
    mlUciStressModel = {
      predictedClass: mlInference.cad_prediction,
      label: mlInference.cad_prediction === 1 ? 'Positive for Inducible Ischemia' : 'Negative for Inducible Ischemia',
      confidence: mlInference.confidence,
      riskProbability: mlInference.cad_probability,
      modelName: 'UCI Cleveland Random Forest Classifier (ROC-AUC 0.9545)'
    };
  }

  let clinicalStatus = 'inconclusive';
  if (oldpeak !== null) {
    if (oldpeak >= 2.0 || exang === 1 || (slope === 3 && oldpeak >= 1.0)) {
      clinicalStatus = 'abnormal';
    } else if (oldpeak >= 1.0 || slope === 2) {
      clinicalStatus = 'borderline';
    } else {
      clinicalStatus = 'normal';
    }
  }

  return {
    status: clinicalStatus,
    measurements: {
      thalach,
      restingHR: tmtInput.restingHR != null ? Number(tmtInput.restingHR) : null,
      targetHeartRate: tmtInput.targetHrPercent != null ? { achievedPercentOfMax: Number(tmtInput.targetHrPercent) } : null,
      mets: tmtInput.mets != null ? Number(tmtInput.mets) : null,
      durationMinutes: duration,
      exang,
      oldpeak,
      slope,
      restecg
    },
    protocol: tmtInput.protocol || 'Standard Bruce',
    reportedConclusion: tmtInput.reportedConclusion || null,
    dukeTreadmillScore,
    mlUciStressModel,
    warning: mlError
  };
}

module.exports = {
  parseTmtText,
  analyzeTmt,
  computeDukeScore
};
