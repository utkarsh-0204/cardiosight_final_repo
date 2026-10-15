// =============================================================================
// ECG Service
// Extracts, normalizes, and evaluates ECG clinical findings from report text
// based on AHA/ACC/HRS electrocardiology standards and PTB-XL diagnostic ontology.
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
 * "Heart Rate: 72 bpm", "Heart rate (bpm): 75", "Heart rate (bpm) 75",
 * "Vent. Rate: 68", "Ventricular Rate: 82 BPM", "HR: 84", "Pulse: 76 bpm"
 * Does NOT match "Heart rate (bpm) Not provided"
 * @param {string} text
 */
function extractHeartRate(text) {
  const re = /(?:ventricular\s+rate|vent\.?\s*rate|heart\s+rate|pulse(?:\s+rate)?|\bhr\b)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{2,3})(?!\d)/i;
  const match = text.match(re);
  if (!match) return null;

  // Verify the following text isn't "not provided"
  const num = Number.parseInt(match[1], 10);
  if (Number.isFinite(num) && num >= 25 && num <= 300) {
    return num;
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
 * @param {string} text
 */
function extractRhythm(text) {
  const lineMatch = text.match(/(?:cardiac\s+rhythm|heart\s+rhythm|\brhythm\b)\s*[:=]\s*([^\n\r]+)/i);
  if (lineMatch) {
    const raw = lineMatch[1].trim();
    if (isUnprovided(raw)) return null;
    if (/atrial\s+fibrillation|a-?fib/i.test(raw)) return 'Atrial Fibrillation';
    if (/atrial\s+flutter/i.test(raw)) return 'Atrial Flutter';
    if (/sinus\s+tachycardia/i.test(raw)) return 'Sinus Tachycardia';
    if (/sinus\s+bradycardia/i.test(raw)) return 'Sinus Bradycardia';
    if (/sinus\s+rhythm|normal\s+sinus/i.test(raw)) return 'Normal Sinus Rhythm';
    return raw;
  }

  const templateMatch = text.match(/(?:cardiac\s+rhythm|heart\s+rhythm|\brhythm\b)\s+([^\n\r]+)/i);
  if (templateMatch && isUnprovided(templateMatch[1])) return null;

  if (/atrial\s+fibrillation|a-?fib/i.test(text)) return 'Atrial Fibrillation';
  if (/atrial\s+flutter/i.test(text)) return 'Atrial Flutter';
  if (/sinus\s+tachycardia/i.test(text)) return 'Sinus Tachycardia';
  if (/sinus\s+bradycardia/i.test(text)) return 'Sinus Bradycardia';
  if (/normal\s+sinus\s+rhythm/i.test(text) || /\bsinus\s+rhythm\b/i.test(text)) return 'Normal Sinus Rhythm';

  return null;
}

/**
 * Extracts physician diagnosis, interpretation, or impression from text.
 * Strips unpopulated template lines and legal disclaimers.
 * @param {string} text
 */
function extractDiagnosis(text) {
  const interpMatch = text.match(/(?:written\s+report\s+diagnosis\s*\/?\s*interpretation|interpretation|ecg\s+interpretation|impression|conclusion|diagnosis)\s*[:=]\s*([^\n\r]+)/i);
  if (interpMatch && interpMatch[1]) {
    const raw = interpMatch[1].trim().replace(/^[:=\s]+/, '');
    if (!isUnprovided(raw)) {
      // Clean off trailing boilerplate if present
      const clean = raw.split(/\b(?:Clinical note|This report template|Signed by)\b/i)[0].trim();
      if (clean && !isUnprovided(clean)) {
        return clean;
      }
    }
  }
  return null;
}

/**
 * Parses ECG report text and extracts structured electrophysiological measurements.
 * @param {string} text Raw text extracted from ECG report
 */
function parseEcgText(text) {
  if (!text || typeof text !== 'string') {
    return {
      extractionStatus: 'empty',
      fields: getEmptyFields(),
      reportedDiagnosis: null,
      summary: null,
      warnings: ['No readable text found in ECG report.']
    };
  }

  const cleanText = cleanReportText(text);

  // 1. Heart Rate / Ventricular Rate (bpm)
  const heartRate = extractHeartRate(cleanText);

  // 2. PR Interval (ms)
  // Matches "PR Interval: 160 ms", "PR: 148", "P-R: 170ms", "PR interval (ms) 160", "PR: 0.16 s"
  const prInterval = extractIntervalMs(
    cleanText,
    /(?:p-?r\s*(?:interval|int\.?)|p-?r)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i
  );

  // 3. QRS Duration (ms)
  // Matches "QRS Duration: 88 ms", "QRS: 92 ms", "QRS dur: 104", "QRS duration (ms) 88"
  const qrsDuration = extractIntervalMs(
    cleanText,
    /(?:qrs\s*(?:duration|dur\.?|width)|qrs)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,3}(?:\.\d+)?)\s*(ms|msec|s(?:ec)?)?/i
  );

  // 4 & 5. QT and QTc Intervals (ms)
  const { qt: qtInterval, qtc: qtcInterval } = parseQtAndQtc(cleanText);

  // 6. ST-Segment Findings
  const stFindings = extractStFindings(cleanText);

  // 7. T-Wave Findings
  const tWaveFindings = extractTWaveFindings(cleanText);

  // 8. Rhythm Classification
  const rhythm = extractRhythm(cleanText);

  // 9. Written Diagnosis / Interpretation
  const diagnosis = extractDiagnosis(cleanText);

  const stField = {
    value: stFindings,
    unit: '',
    status: stFindings !== null ? 'extracted' : 'not_found'
  };

  const tWaveField = {
    value: tWaveFindings,
    unit: '',
    status: tWaveFindings !== null ? 'extracted' : 'not_found'
  };

  // Build fields contract supporting both stFindings/stSegment and tWaveFindings/tWave
  const fields = {
    heartRate: {
      value: heartRate,
      unit: 'bpm',
      status: heartRate !== null ? 'extracted' : 'not_found'
    },
    prInterval: {
      value: prInterval,
      unit: 'ms',
      status: prInterval !== null ? 'extracted' : 'not_found'
    },
    qrsDuration: {
      value: qrsDuration,
      unit: 'ms',
      status: qrsDuration !== null ? 'extracted' : 'not_found'
    },
    qtInterval: {
      value: qtInterval,
      unit: 'ms',
      status: qtInterval !== null ? 'extracted' : 'not_found'
    },
    qtcInterval: {
      value: qtcInterval,
      unit: 'ms',
      status: qtcInterval !== null ? 'extracted' : 'not_found'
    },
    stFindings: stField,
    stSegment: stField,
    tWaveFindings: tWaveField,
    tWave: tWaveField,
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

  const coreFieldsList = [
    fields.heartRate,
    fields.prInterval,
    fields.qrsDuration,
    fields.qtInterval,
    fields.qtcInterval,
    fields.stFindings,
    fields.tWaveFindings,
    fields.rhythm,
    fields.interpretation
  ];
  const extractedCount = coreFieldsList.filter(f => f.status === 'extracted').length;

  const warnings = [];
  let extractionStatus = 'empty';

  if (extractedCount === 0) {
    extractionStatus = 'empty';
    warnings.push(
      'This document does not contain any readable clinical ECG measurements or diagnosis. It appears to be an unpopulated template. Please manually enter your values.'
    );
  } else if (extractedCount < 3) {
    extractionStatus = 'partial';
    warnings.push(
      'Only partial standard measurements could be extracted automatically. Please verify or manually enter missing values.'
    );
  } else {
    extractionStatus = 'success';
  }

  return {
    extractionStatus,
    fields,
    reportedDiagnosis: diagnosis,
    summary: diagnosis,
    warnings
  };
}

function getEmptyFields() {
  const notFound = (unit = '') => ({ value: null, unit, status: 'not_found' });
  const emptySt = notFound('');
  const emptyTw = notFound('');
  return {
    heartRate: notFound('bpm'),
    prInterval: notFound('ms'),
    qrsDuration: notFound('ms'),
    qtInterval: notFound('ms'),
    qtcInterval: notFound('ms'),
    stFindings: emptySt,
    stSegment: emptySt,
    tWaveFindings: emptyTw,
    tWave: emptyTw,
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
