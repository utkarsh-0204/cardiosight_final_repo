// =============================================================================
// ECG Service
// Extracts, normalizes, and evaluates ECG clinical findings from report text
// based on AHA/ACC/HRS electrocardiology standards and PTB-XL diagnostic ontology.
// Supports both 12-lead standard clinical ECGs and single-lead wearable reports (e.g. WHOOP, Apple Watch).
// =============================================================================

/**
 * Checks if a string represents an unprovided/missing template placeholder.
 * @param {string} str
 */
function isUnprovided(str) {
  if (!str || typeof str !== 'string') return true;
  return /^(?:not\s+(?:provided|specified|available|applicable)|n\/?a|none(?:\s+reported)?|nil|unspecified|blank|[-_—\s]+)$/i.test(str.trim());
}

/**
 * Cleans extracted text to remove trailing template prompts/boilerplates.
 * @param {string} text
 */
function cleanReportText(text) {
  if (!text) return '';
  return text
    .replace(/\r\n/g, '\n')
    .replace(/_{3,}/g, '') // remove fill-in-the-blank lines
    .trim();
}

/**
 * Extracts a numeric value for heart rate / pulse rate in bpm.
 * Matches:
 * "57 BPM Average Heart Rate", "57 BPM \n Average Heart Rate",
 * "Heart Rate: 72 bpm", "Heart rate (bpm): 75", "Heart rate (bpm) 75",
 * "Vent. Rate: 68", "Ventricular Rate: 82 BPM", "HR: 84", "Pulse: 76 bpm",
 * "Average Heart Rate: 57", "Average Heart Rate 57 bpm"
 * Does NOT match "Heart rate (bpm) Not provided"
 * @param {string} text
 */
function extractHeartRate(text) {
  if (!text) return null;

  // 1. Prefix pattern (common in wearables like WHOOP, Apple Watch): "57 BPM \n Average Heart Rate"
  const prefixMatch = text.match(/(\d{2,3})\s*bpm\s*(?:\r?\n|[ \t])+(?:average\s+)?(?:heart\s+rate|pulse(?:\s+rate)?|\bhr\b)/i);
  if (prefixMatch) {
    const num = Number.parseInt(prefixMatch[1], 10);
    if (Number.isFinite(num) && num >= 25 && num <= 300) return num;
  }

  // 2. Explicit label with colon or equals: "Average Heart Rate: 57", "Heart Rate: 72 bpm", "Vent. Rate: 68"
  const colonMatch = text.match(/(?:ventricular\s+rate|vent\.?\s*rate|average\s+heart\s+rate|heart\s+rate|pulse(?:\s+rate)?|\bhr\b)\s*(?:\([^)]*\))?\s*[:=]\s*(\d{2,3})(?!\d)/i);
  if (colonMatch) {
    const num = Number.parseInt(colonMatch[1], 10);
    if (Number.isFinite(num) && num >= 25 && num <= 300) return num;
  }

  // 3. Label followed immediately by number with unit bpm: "Average Heart Rate 57 bpm", "Heart rate 72 bpm"
  const bpmMatch = text.match(/(?:ventricular\s+rate|vent\.?\s*rate|average\s+heart\s+rate|heart\s+rate|pulse(?:\s+rate)?|\bhr\b)\s*(?:\([^)]*\))?\s+(\d{2,3})\s*bpm\b/i);
  if (bpmMatch) {
    const num = Number.parseInt(bpmMatch[1], 10);
    if (Number.isFinite(num) && num >= 25 && num <= 300) return num;
  }

  // 4. Bracketed unit: "Heart rate (bpm) 75"
  const bracketMatch = text.match(/(?:ventricular\s+rate|vent\.?\s*rate|average\s+heart\s+rate|heart\s+rate|pulse(?:\s+rate)?|\bhr\b)\s*\((?:bpm|beats\s*\/?\s*min)\)\s*[:=]?\s*(\d{2,3})(?!\d)/i);
  if (bracketMatch) {
    const num = Number.parseInt(bracketMatch[1], 10);
    if (Number.isFinite(num) && num >= 25 && num <= 300) return num;
  }

  // 5. Fallback general: label followed by number
  const fallback = text.match(/(?:ventricular\s+rate|vent\.?\s*rate|average\s+heart\s+rate|heart\s+rate|pulse(?:\s+rate)?|\bhr\b)\s*[:=]?\s*(\d{2,3})(?!\d)/i);
  if (fallback) {
    const num = Number.parseInt(fallback[1], 10);
    if (Number.isFinite(num) && num >= 25 && num <= 300) return num;
  }

  return null;
}

/**
 * Extracts ECG test recording date and normalizes month to full name.
 * e.g. "Recorded on: Oct 10, 2026, 7:50:41 PM" -> "October 10, 2026"
 * @param {string} text
 */
function extractRecordingDate(text) {
  if (!text) return null;
  const match = text.match(/(?:recorded\s+on|recording\s+date|date\s+of\s+recording|test\s+date|date)\s*[:=]?\s*([A-Za-z]{3,9}\s+\d{1,2},?\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  if (match) {
    const dateStr = match[1].trim();
    const months = {
      jan: 'January', feb: 'February', mar: 'March', apr: 'April',
      may: 'May', jun: 'June', jul: 'July', aug: 'August',
      sep: 'September', sept: 'September', oct: 'October',
      nov: 'November', dec: 'December'
    };
    const m = dateStr.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
    if (m) {
      const mon = m[1].toLowerCase().slice(0, 3);
      const fullMonth = months[mon] || m[1];
      return `${fullMonth} ${m[2]}, ${m[3]}`;
    }
    return dateStr;
  }
  return null;
}

/**
 * Extracts an ECG interval (PR, QRS, QT, QTc) in milliseconds.
 * Normalizes seconds (e.g. 0.16 s -> 160 ms) to ms.
 * @param {string} text
 * @param {RegExp} regex
 */
function extractIntervalMs(text, regex) {
  const match = text.match(regex);
  if (!match || match[1] === undefined) return null;

  let val = Number.parseFloat(match[1]);
  if (!Number.isFinite(val)) return null;

  const unit = (match[2] || '').toLowerCase();
  // If unit is in seconds or value is fractional (< 1.5), convert to milliseconds
  if (unit.startsWith('s') || val < 1.5) {
    val = Math.round(val * 1000);
  } else {
    val = Math.round(val);
  }

  return Number.isFinite(val) ? val : null;
}

/**
 * Parses QT and QTc intervals, handling combined formats like:
 * "QT/QTc: 390/424 ms", "QT/QTc 380 / 430",
 * and individual formats "QT interval (ms) 380", "QTc Bazett: 430 ms".
 * @param {string} text
 */
function parseQtAndQtc(text) {
  let qt = null;
  let qtc = null;

  // 1. Combined QT/QTc format
  const comboMatch = text.match(/(?:qt\s*\/\s*qtc[a-z]?)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(?:ms)?\s*\/\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i);
  if (comboMatch) {
    let qVal = Number.parseFloat(comboMatch[1]);
    let qcVal = Number.parseFloat(comboMatch[2]);
    const unit = (comboMatch[3] || '').toLowerCase();
    if (unit.startsWith('s') || qVal < 1.5) qVal = Math.round(qVal * 1000);
    if (unit.startsWith('s') || qcVal < 1.5) qcVal = Math.round(qcVal * 1000);
    if (Number.isFinite(qVal) && qVal >= 150 && qVal <= 900) qt = qVal;
    if (Number.isFinite(qcVal) && qcVal >= 200 && qcVal <= 900) qtc = qcVal;
  }

  // 2. Individual QT interval
  if (qt === null) {
    const qMatch = text.match(/(?:^|[^a-zA-Z0-9/])(?:q-?t\s*(?:interval|int\.?)|q-?t)(?!\s*\/|\s*c)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i);
    if (qMatch) {
      let val = Number.parseFloat(qMatch[1]);
      const unit = (qMatch[2] || '').toLowerCase();
      if (unit.startsWith('s') || val < 1.5) val = Math.round(val * 1000);
      else val = Math.round(val);
      if (Number.isFinite(val) && val >= 150 && val <= 900) qt = val;
    }
  }

  // 3. Individual QTc interval (Bazett, Hodges, Fridericia)
  if (qtc === null) {
    const qcMatch = text.match(/(?:^|[^a-zA-Z0-9/])(?:q-?tc[bfh]?(?:\s*(?:bazett|fridericia|hodges))?|q-?tc\s*interval)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i);
    if (qcMatch) {
      let val = Number.parseFloat(qcMatch[1]);
      const unit = (qcMatch[2] || '').toLowerCase();
      if (unit.startsWith('s') || val < 1.5) val = Math.round(val * 1000);
      else val = Math.round(val);
      if (Number.isFinite(val) && val >= 200 && val <= 900) qtc = val;
    }
  }

  return { qt, qtc };
}

/**
 * Extracts ST-segment findings from text.
 * @param {string} text
 */
function extractStFindings(text) {
  // First, check explicit line with colon/equals
  const lineMatch = text.match(/(?:^|[^a-zA-Z0-9])\bst[\s-]?(?:segment)?\s*(?:findings?|result)?\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    if (/elevation|elevated/i.test(raw)) return 'ST Elevation';
    if (/depression|depressed/i.test(raw)) return 'ST Depression';
    if (/non-?specific/i.test(raw)) return 'Non-specific ST Changes';
    if (/normal|isoelectric/i.test(raw)) return 'Normal';
    return raw;
  }

  // Check template lines without colon (e.g. "ST-segment findings Not provided")
  const templateMatch = text.match(/(?:^|[^a-zA-Z0-9])\bst[\s-]?(?:segment)?\s*(?:findings?|result)?\s+([^\n\r]+)/i);
  if (templateMatch && isUnprovided(templateMatch[1])) {
    return null;
  }

  // Search across report text for clinical terminology
  if (/\bst[\s-]?(?:segment\s+)?(?:elevation|elevated)\b/i.test(text)) {
    return 'ST Elevation';
  }
  if (/\bst[\s-]?(?:segment\s+)?(?:depression|depressed)\b/i.test(text)) {
    return 'ST Depression';
  }
  if (/\bnon-?specific\s+st\b/i.test(text)) {
    return 'Non-specific ST Changes';
  }
  if (/\bnormal\s+st[\s-]?(?:segment)?\b/i.test(text) || /\bisoelectric\s+st\b/i.test(text)) {
    return 'Normal';
  }

  return null;
}

/**
 * Extracts T-wave findings from text.
 * @param {string} text
 */
function extractTWaveFindings(text) {
  // First, check explicit line with colon/equals
  const lineMatch = text.match(/(?:^|[^a-zA-Z0-9])\bt[\s-]?(?:wave)?\s*(?:findings?|result)?\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    if (/inversion|inverted/i.test(raw)) return 'T-Wave Inversion';
    if (/flat|flattened/i.test(raw)) return 'Flattened T-Waves';
    if (/tall|peaked|hyperacute/i.test(raw)) return 'Peaked T-Waves';
    if (/normal|upright/i.test(raw)) return 'Normal';
    return raw;
  }

  // Check template line without colon
  const templateMatch = text.match(/(?:^|[^a-zA-Z0-9])\bt[\s-]?(?:wave)?\s*(?:findings?|result)?\s+([^\n\r]+)/i);
  if (templateMatch && isUnprovided(templateMatch[1])) {
    return null;
  }

  if (/\bt[\s-]?(?:wave\s+)?(?:inversion|inverted)\b/i.test(text)) {
    return 'T-Wave Inversion';
  }
  if (/(?:flat|flattened)\s+t[\s-]?(?:waves?)?\b/i.test(text)) {
    return 'Flattened T-Waves';
  }
  if (/(?:tall|peaked|hyperacute)\s+t[\s-]?(?:waves?)?\b/i.test(text)) {
    return 'Peaked T-Waves';
  }
  if (/\bnormal\s+t[\s-]?(?:waves?)?\b/i.test(text) || /\bupright\s+t[\s-]?(?:waves?)?\b/i.test(text)) {
    return 'Normal';
  }

  return null;
}

/**
 * Extracts Cardiac Rhythm classification.
 * Prioritizes explicit classification headers and lines.
 * Filters out disclaimers and negated mentions of AFib (e.g. "doesn't show signs of atrial fibrillation").
 * Returns null if no rhythm could be determined (never assigns false default like AFib).
 * @param {string} text
 */
function extractRhythm(text) {
  if (!text || typeof text !== 'string') return null;

  // 1. Explicit key-value line: "Rhythm: Normal Sinus Rhythm", "Cardiac rhythm: Sinus Bradycardia"
  const lineMatch = text.match(/(?:cardiac\s+rhythm|heart\s+rhythm|\brhythm(?:\s+classification)?)\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (!isUnprovided(raw)) {
      if (/normal\s+sinus/i.test(raw) || /\bsinus\s+rhythm\b/i.test(raw)) return 'Normal Sinus Rhythm';
      if (/sinus\s+bradycardia/i.test(raw)) return 'Sinus Bradycardia';
      if (/sinus\s+tachycardia/i.test(raw)) return 'Sinus Tachycardia';
      if (/sinus\s+arrhythmia/i.test(raw)) return 'Sinus Arrhythmia';
      if (/atrial\s+fibrillation|a-?fib\b/i.test(raw)) {
        if (!/(?:no|not|negative|without|doesn't)\s+(?:evidence\s+of\s+|signs?\s+of\s+)?(?:atrial\s+fibrillation|a-?fib)/i.test(raw)) {
          return 'Atrial Fibrillation';
        }
      }
      if (/atrial\s+flutter/i.test(raw)) return 'Atrial Flutter';
      return raw;
    }
  }

  // 2. Standalone classification header line (WHOOP / Apple Watch / ECG title block)
  // e.g. "Normal Sinus Rhythm\nYour heart rhythm appears normal..."
  const standaloneMatch = text.match(/(?:^|\r?\n)\s*(Normal\s+Sinus\s+Rhythm|Sinus\s+Bradycardia|Sinus\s+Tachycardia|Sinus\s+Arrhythmia|Atrial\s+Fibrillation|Atrial\s+Flutter)\s*(?:\r?\n|$)/i);
  if (standaloneMatch) {
    const matched = standaloneMatch[1].trim();
    if (/normal\s+sinus/i.test(matched)) return 'Normal Sinus Rhythm';
    if (/sinus\s+bradycardia/i.test(matched)) return 'Sinus Bradycardia';
    if (/sinus\s+tachycardia/i.test(matched)) return 'Sinus Tachycardia';
    if (/sinus\s+arrhythmia/i.test(matched)) return 'Sinus Arrhythmia';
    if (/atrial\s+fibrillation/i.test(matched)) return 'Atrial Fibrillation';
    if (/atrial\s+flutter/i.test(matched)) return 'Atrial Flutter';
  }

  // 3. Negation & disclaimer detection for AFib
  // Strips phrases like "doesn't show signs of atrial fibrillation" or "discriminating atrial fibrillation (AFib)"
  const strippedText = text
    .replace(/(?:doesn't|does\s+not)\s+show\s+(?:any\s+)?(?:signs?\s+of\s+)?(?:atrial\s+fibrillation|a-?fib)/gi, '')
    .replace(/(?:no\s+signs?|no\s+evidence|negative\s+for|without)\s+(?:of\s+)?(?:atrial\s+fibrillation|a-?fib)/gi, '')
    .replace(/(?:discriminating|discriminate|differentiating)\s+(?:atrial\s+fibrillation|a-?fib)/gi, '')
    .replace(/purposes?\s+of\s+discriminating[^\n\r.]*/gi, '')
    .replace(/not\s+intended\s+to\s+replace[^\n\r.]*/gi, '');

  // 4. Look for positive rhythm indicators in sanitized text
  if (/\bnormal\s+sinus\s+rhythm\b/i.test(strippedText) || /\bheart\s+rhythm\s+appears\s+normal\b/i.test(strippedText)) {
    return 'Normal Sinus Rhythm';
  }
  if (/\bsinus\s+bradycardia\b/i.test(strippedText)) {
    return 'Sinus Bradycardia';
  }
  if (/\bsinus\s+tachycardia\b/i.test(strippedText)) {
    return 'Sinus Tachycardia';
  }
  if (/\bsinus\s+arrhythmia\b/i.test(strippedText)) {
    return 'Sinus Arrhythmia';
  }
  if (/\bsinus\s+rhythm\b/i.test(strippedText)) {
    return 'Normal Sinus Rhythm';
  }
  if (/\batrial\s+fibrillation\b|\ba-?fib\b/i.test(strippedText)) {
    return 'Atrial Fibrillation';
  }
  if (/\batrial\s+flutter\b/i.test(strippedText)) {
    return 'Atrial Flutter';
  }

  return null;
}

/**
 * Extracts physician diagnosis, interpretation, or wearable summary from text.
 * Strips unpopulated template lines and legal disclaimers.
 * @param {string} text
 */
function extractDiagnosis(text) {
  // 1. Explicit written report diagnosis / interpretation / impression / conclusion
  const interpMatch = text.match(/(?:written\s+report\s+diagnosis\s*\/?\s*interpretation|ecg\s+interpretation|interpretation|impression|conclusion|diagnosis)\s*[:=]\s*([^\n\r]+)/i);
  if (interpMatch && interpMatch[1]) {
    const raw = interpMatch[1].trim().replace(/^[:=\s]+/, '');
    if (!isUnprovided(raw)) {
      const clean = raw.split(/\b(?:Clinical note|This report template|Signed by)\b/i)[0].trim();
      if (clean && !isUnprovided(clean)) {
        return clean;
      }
    }
  }

  // 2. Wearable report summary (e.g. WHOOP, Apple Watch, wearable rhythm impression)
  const wearableSummary = text.match(/(Your\s+heart\s+rhythm\s+appears\s+normal[\s\S]*?(?:atrial\s+fibrillation|sinus\s+rhythm)\.?)/i);
  if (wearableSummary) {
    return wearableSummary[1].replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return null;
}

/**
 * Parses ECG report text and extracts structured electrophysiological measurements.
 * Accurately classifies single-lead wearable reports vs 12-lead clinical ECGs.
 * @param {string} text Raw text extracted from ECG report
 * @param {string} fileName Optional filename to aid modality detection
 */
function parseEcgText(text, fileName = '') {
  if (!text || typeof text !== 'string') {
    return {
      extractionStatus: 'empty',
      modality: 'standard_12_lead',
      fields: getEmptyFields(),
      reportedDiagnosis: null,
      summary: null,
      extractedFieldsSummary: [],
      missingFieldsSummary: [],
      unsupportedFieldsSummary: [],
      warnings: ['No readable text found in ECG report.']
    };
  }

  const cleanText = cleanReportText(text);

  // Modality detection: Single-Lead Wearable vs Standard 12-Lead Clinical ECG
  const isSingleLead =
    /whoop|apple\s+watch|kardia|lead\s+i\b|single[\s-]lead|waveform\s+is\s+similar\s+to\s+a\s+lead\s+i/i.test(cleanText) ||
    (fileName && /whoop|apple[\s_-]?watch|single[\s_-]?lead/i.test(fileName));

  const modality = isSingleLead ? 'single_lead' : 'standard_12_lead';

  // 1. Heart Rate / Ventricular Rate (bpm)
  const heartRate = extractHeartRate(cleanText);

  // 2. Recording Date (Oct 10, 2026 -> October 10, 2026)
  const recordingDate = extractRecordingDate(cleanText);

  // 3. Rhythm Classification
  const rhythm = extractRhythm(cleanText);

  // 4. Written Diagnosis / Interpretation
  const diagnosis = extractDiagnosis(cleanText);

  // 5. 12-lead interval measurements (Only applicable to multi-lead clinical ECGs)
  let prInterval = null;
  let qrsDuration = null;
  let qtInterval = null;
  let qtcInterval = null;
  let stFindings = null;
  let tWaveFindings = null;

  if (!isSingleLead) {
    prInterval = extractIntervalMs(
      cleanText,
      /(?:p-?r\s*(?:interval|int\.?)|p-?r)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i
    );

    qrsDuration = extractIntervalMs(
      cleanText,
      /(?:qrs\s*(?:duration|dur\.?|width)|qrs)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i
    );

    const qtParsed = parseQtAndQtc(cleanText);
    qtInterval = qtParsed.qt;
    qtcInterval = qtParsed.qtc;

    stFindings = extractStFindings(cleanText);
    tWaveFindings = extractTWaveFindings(cleanText);
  }

  // Field status mapping:
  // - extracted: measurement was successfully parsed
  // - unsupported: not recorded by this modality (e.g. 12-lead intervals on single-lead wearable)
  // - not_found: expected by modality but missing in document
  const unsupportedStatus = isSingleLead ? 'unsupported' : 'not_found';

  const fields = {
    heartRate: {
      value: heartRate,
      unit: 'bpm',
      status: heartRate !== null ? 'extracted' : 'not_found'
    },
    recordingDate: {
      value: recordingDate,
      unit: '',
      status: recordingDate !== null ? 'extracted' : (isSingleLead ? 'not_found' : 'not_applicable')
    },
    prInterval: {
      value: prInterval,
      unit: 'ms',
      status: prInterval !== null ? 'extracted' : unsupportedStatus
    },
    qrsDuration: {
      value: qrsDuration,
      unit: 'ms',
      status: qrsDuration !== null ? 'extracted' : unsupportedStatus
    },
    qtInterval: {
      value: qtInterval,
      unit: 'ms',
      status: qtInterval !== null ? 'extracted' : unsupportedStatus
    },
    qtcInterval: {
      value: qtcInterval,
      unit: 'ms',
      status: qtcInterval !== null ? 'extracted' : unsupportedStatus
    },
    stFindings: {
      value: stFindings,
      unit: '',
      status: stFindings !== null ? 'extracted' : unsupportedStatus
    },
    stSegment: {
      value: stFindings,
      unit: '',
      status: stFindings !== null ? 'extracted' : unsupportedStatus
    },
    tWaveFindings: {
      value: tWaveFindings,
      unit: '',
      status: tWaveFindings !== null ? 'extracted' : unsupportedStatus
    },
    tWave: {
      value: tWaveFindings,
      unit: '',
      status: tWaveFindings !== null ? 'extracted' : unsupportedStatus
    },
    rhythm: {
      value: rhythm,
      unit: '',
      status: rhythm !== null ? 'extracted' : 'not_found'
    },
    interpretation: {
      value: diagnosis,
      unit: '',
      status: diagnosis !== null ? 'extracted' : 'not_found'
    }
  };

  const warnings = [];
  let extractionStatus = 'empty';

  const extractedFieldsSummary = [];
  const manualReviewFieldsSummary = [];
  const unsupportedFieldsSummary = [];
  const missingFieldsSummary = [];

  if (isSingleLead) {
    // Single-Lead Wearable rules:
    // Core parameters: heartRate and rhythm
    if (heartRate !== null) extractedFieldsSummary.push(`Heart Rate (${heartRate} BPM)`);
    else missingFieldsSummary.push('Heart Rate');

    if (rhythm !== null) extractedFieldsSummary.push(`Rhythm (${rhythm})`);
    else missingFieldsSummary.push('Rhythm');

    if (recordingDate !== null) extractedFieldsSummary.push(`Recording Date (${recordingDate})`);
    if (diagnosis !== null) manualReviewFieldsSummary.push('Clinical Impression / Physician Review');

    unsupportedFieldsSummary.push('PR Interval', 'QRS Duration', 'QT/QTc Interval', 'ST Segment', 'T-Wave');

    if (heartRate !== null && rhythm !== null) {
      extractionStatus = 'success';
      // No warnings when single-lead extraction succeeds
    } else if (heartRate !== null || rhythm !== null) {
      extractionStatus = 'partial';
      warnings.push(
        'Partial wearable ECG extracted. Please review and enter any unparsed parameters manually.'
      );
    } else {
      extractionStatus = 'empty';
      warnings.push(
        'Could not extract heart rate or rhythm from this single-lead document. Please enter values manually.'
      );
    }
  } else {
    // Standard 12-Lead Clinical ECG rules:
    // 1. Objective fiducial parameters -> Successfully Extracted
    if (heartRate !== null) extractedFieldsSummary.push(`Heart Rate (${heartRate} bpm)`);
    else missingFieldsSummary.push('Heart Rate');

    if (prInterval !== null) extractedFieldsSummary.push(`PR Interval (${prInterval} ms)`);
    else missingFieldsSummary.push('PR Interval');

    if (qrsDuration !== null) extractedFieldsSummary.push(`QRS Duration (${qrsDuration} ms)`);
    else missingFieldsSummary.push('QRS Duration');

    if (rhythm !== null) extractedFieldsSummary.push(`Rhythm (${rhythm})`);
    else missingFieldsSummary.push('Rhythm');

    if (recordingDate !== null) extractedFieldsSummary.push(`Recording Date (${recordingDate})`);

    // 2. Repolarization & Morphological parameters -> Requires Manual Review
    if (qtInterval !== null) manualReviewFieldsSummary.push(`QT Interval (${qtInterval} ms)`);
    if (qtcInterval !== null) manualReviewFieldsSummary.push(`QTc Interval (${qtcInterval} ms)`);
    if (stFindings !== null && !isUnprovided(stFindings)) manualReviewFieldsSummary.push(`ST-Segment Findings (${stFindings})`);
    if (tWaveFindings !== null && !isUnprovided(tWaveFindings)) manualReviewFieldsSummary.push(`T-Wave Findings (${tWaveFindings})`);
    if (diagnosis !== null && !isUnprovided(diagnosis)) manualReviewFieldsSummary.push(`Physician Diagnosis / Interpretation`);

    const totalExtracted = extractedFieldsSummary.length + manualReviewFieldsSummary.length;

    if (totalExtracted === 0) {
      extractionStatus = 'empty';
      warnings.push(
        'This document does not contain readable clinical ECG measurements or diagnosis. It appears to be an unpopulated template. Please manually enter your values.'
      );
    } else if (totalExtracted < 3) {
      extractionStatus = 'partial';
      warnings.push(
        'Only partial standard measurements could be extracted automatically. Please verify or manually enter missing values.'
      );
    } else {
      extractionStatus = 'success';
      // No warnings when extraction is successful and all present fields are processed
    }
  }

  return {
    extractionStatus,
    modality,
    fields,
    reportedDiagnosis: diagnosis,
    summary: diagnosis,
    extractedFieldsSummary,
    manualReviewFieldsSummary,
    missingFieldsSummary,
    unsupportedFieldsSummary,
    warnings
  };
}

function getEmptyFields(isSingleLead = false) {
  const notFound = (unit = '') => ({ value: null, unit, status: 'not_found' });
  const unsupported = (unit = '') => ({ value: null, unit, status: isSingleLead ? 'unsupported' : 'not_found' });

  return {
    heartRate: notFound('bpm'),
    recordingDate: notFound(''),
    prInterval: unsupported('ms'),
    qrsDuration: unsupported('ms'),
    qtInterval: unsupported('ms'),
    qtcInterval: unsupported('ms'),
    stFindings: unsupported(''),
    stSegment: unsupported(''),
    tWaveFindings: unsupported(''),
    tWave: unsupported(''),
    rhythm: notFound(''),
    interpretation: notFound('')
  };
}

/**
 * Evaluates clinical criteria for verified ECG measurements.
 * Follows AHA/ACC/HRS standard clinical thresholds.
 * Never replaces missing measurements with 0 or defaults unprovided findings to Normal.
 * @param {object} input Verified ECG fields
 */
function evaluateEcgFindings(input = {}) {
  const findings = [];
  let severity = 'normal';

  const rawHr = input.heartRate != null && input.heartRate !== '' ? Number(input.heartRate) : null;
  const rawPr = input.prInterval != null && input.prInterval !== '' ? Number(input.prInterval) : null;
  const rawQrs = input.qrsDuration != null && input.qrsDuration !== '' ? Number(input.qrsDuration) : null;
  const rawQt = input.qtInterval != null && input.qtInterval !== '' ? Number(input.qtInterval) : null;
  const rawQtc = input.qtcInterval != null && input.qtcInterval !== '' ? Number(input.qtcInterval) : null;
  const rawSt = input.stFindings || input.stSegment || null;
  const rawTw = input.tWaveFindings || input.tWave || null;
  const rawRhythm = input.rhythm || null;

  // Check whether any measurements were actually provided
  const hasAnyData =
    (rawHr !== null && Number.isFinite(rawHr) && rawHr > 0) ||
    (rawPr !== null && Number.isFinite(rawPr) && rawPr > 0) ||
    (rawQrs !== null && Number.isFinite(rawQrs) && rawQrs > 0) ||
    (rawQtc !== null && Number.isFinite(rawQtc) && rawQtc > 0) ||
    (rawSt && !isUnprovided(rawSt)) ||
    (rawTw && !isUnprovided(rawTw)) ||
    (rawRhythm && !isUnprovided(rawRhythm));

  if (!hasAnyData) {
    return {
      status: 'indeterminate',
      overallSeverity: 'indeterminate',
      measurements: {
        heartRate: null,
        prInterval: null,
        qrsDuration: null,
        qtInterval: null,
        qtcInterval: null,
        stFindings: null,
        tWaveFindings: null,
      },
      rhythm: null,
      abnormalities: [],
      ptbxlDiagnosticClass: 'INDETERMINATE',
      findings: [],
      interpretationSummary: 'No clinical ECG measurements provided for automated evaluation.',
      disclaimer: 'ECG findings are derived from reported text and AHA/ACC clinical thresholds. Detecting or not detecting an abnormality does not alone confirm or exclude coronary artery disease.'
    };
  }

  if (rawHr !== null && Number.isFinite(rawHr) && rawHr > 0) {
    if (rawHr < 50) {
      findings.push({ parameter: 'Heart Rate', detail: `${rawHr} bpm (Marked Bradycardia)`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else if (rawHr < 60) {
      findings.push({ parameter: 'Heart Rate', detail: `${rawHr} bpm (Borderline Bradycardia)`, severity: 'low' });
    } else if (rawHr > 100) {
      findings.push({ parameter: 'Heart Rate', detail: `${rawHr} bpm (Tachycardia)`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else {
      findings.push({ parameter: 'Heart Rate', detail: `${rawHr} bpm (Normal resting rate)`, severity: 'normal' });
    }
  }

  if (rawPr !== null && Number.isFinite(rawPr) && rawPr > 0) {
    if (rawPr > 200) {
      findings.push({ parameter: 'PR Interval', detail: `${rawPr} ms (Prolonged - 1st Degree AV Block)`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else if (rawPr < 120) {
      findings.push({ parameter: 'PR Interval', detail: `${rawPr} ms (Short PR interval)`, severity: 'low' });
    } else {
      findings.push({ parameter: 'PR Interval', detail: `${rawPr} ms (Normal AV conduction)`, severity: 'normal' });
    }
  }

  if (rawQrs !== null && Number.isFinite(rawQrs) && rawQrs > 0) {
    if (rawQrs >= 120) {
      findings.push({ parameter: 'QRS Duration', detail: `${rawQrs} ms (Wide QRS / Bundle Branch Block criteria)`, severity: 'high' });
      severity = 'high';
    } else if (rawQrs >= 100) {
      findings.push({ parameter: 'QRS Duration', detail: `${rawQrs} ms (Incomplete conduction delay)`, severity: 'low' });
    } else {
      findings.push({ parameter: 'QRS Duration', detail: `${rawQrs} ms (Normal intraventricular conduction)`, severity: 'normal' });
    }
  }

  if (rawQtc !== null && Number.isFinite(rawQtc) && rawQtc > 0) {
    if (rawQtc >= 480) {
      findings.push({ parameter: 'QTc Interval', detail: `${rawQtc} ms (Severely Prolonged QTc - Arrhythmia risk)`, severity: 'high' });
      severity = 'high';
    } else if (rawQtc >= 450) {
      findings.push({ parameter: 'QTc Interval', detail: `${rawQtc} ms (Borderline Prolonged QTc)`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else {
      findings.push({ parameter: 'QTc Interval', detail: `${rawQtc} ms (Normal repolarization)`, severity: 'normal' });
    }
  }

  if (rawSt && !isUnprovided(rawSt)) {
    if (/elevation/i.test(rawSt)) {
      findings.push({ parameter: 'ST Segment', detail: `${rawSt} (Potential acute myocardial injury)`, severity: 'high' });
      severity = 'high';
    } else if (/depression/i.test(rawSt)) {
      findings.push({ parameter: 'ST Segment', detail: `${rawSt} (Potential subendocardial ischemia)`, severity: 'high' });
      severity = 'high';
    } else if (/non-?specific/i.test(rawSt)) {
      findings.push({ parameter: 'ST Segment', detail: `${rawSt}`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else if (/normal|isoelectric/i.test(rawSt)) {
      findings.push({ parameter: 'ST Segment', detail: 'Normal isoelectric ST segment', severity: 'normal' });
    }
  }

  if (rawTw && !isUnprovided(rawTw)) {
    if (/inversion|inverted/i.test(rawTw)) {
      findings.push({ parameter: 'T-Wave', detail: `${rawTw} (Potential ischemia or strain)`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else if (/flat/i.test(rawTw)) {
      findings.push({ parameter: 'T-Wave', detail: `${rawTw}`, severity: 'low' });
    } else if (/peak/i.test(rawTw)) {
      findings.push({ parameter: 'T-Wave', detail: `${rawTw} (Hyperacute/Metabolic)`, severity: 'medium' });
      severity = severity === 'normal' ? 'medium' : severity;
    } else if (/normal|upright/i.test(rawTw)) {
      findings.push({ parameter: 'T-Wave', detail: 'Normal upright T-waves', severity: 'normal' });
    }
  }

  if (rawRhythm && !isUnprovided(rawRhythm)) {
    if (/fibrillation|flutter/i.test(rawRhythm)) {
      findings.push({ parameter: 'Cardiac Rhythm', detail: `${rawRhythm}`, severity: 'high' });
      severity = 'high';
    } else if (/tachycardia|bradycardia/i.test(rawRhythm)) {
      findings.push({ parameter: 'Cardiac Rhythm', detail: `${rawRhythm}`, severity: 'medium' });
      if (severity === 'normal') severity = 'medium';
    } else if (/normal|sinus/i.test(rawRhythm)) {
      findings.push({ parameter: 'Cardiac Rhythm', detail: `${rawRhythm}`, severity: 'normal' });
    }
  }

  const abnormalities = findings
    .filter(f => f.severity === 'high' || f.severity === 'medium')
    .map(f => f.detail);

  const status = severity === 'high' ? 'abnormal' : (severity === 'medium' ? 'borderline' : 'normal');

  return {
    status,
    overallSeverity: severity,
    measurements: {
      heartRate: rawHr,
      prInterval: rawPr,
      qrsDuration: rawQrs,
      qtInterval: rawQt,
      qtcInterval: rawQtc,
      stFindings: rawSt && !isUnprovided(rawSt) ? rawSt : null,
      tWaveFindings: rawTw && !isUnprovided(rawTw) ? rawTw : null,
    },
    rhythm: rawRhythm && !isUnprovided(rawRhythm) ? rawRhythm : null,
    abnormalities,
    ptbxlDiagnosticClass: severity === 'high' ? 'STTC / MI' : (severity === 'medium' ? 'CD / HYP' : 'NORM'),
    findings,
    interpretationSummary: input.interpretation || (abnormalities.length > 0 ? abnormalities.join('; ') : 'Normal electrocardiographic parameters within AHA/ACC thresholds.'),
    disclaimer: 'ECG findings are derived from reported text and AHA/ACC clinical thresholds. Detecting or not detecting an abnormality does not alone confirm or exclude coronary artery disease.'
  };
}

module.exports = {
  parseEcgText,
  evaluateEcgFindings
};
