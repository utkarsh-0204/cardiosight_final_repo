// =============================================================================
// TMT (Treadmill Test) Service
// Parses exercise stress test reports, computes Duke Treadmill Score (DTS),
// and coordinates with the Django ML service for UCI CAD inference.
// Does NOT mix ECG logic or use Framingham risk inputs.
// =============================================================================

const axios = require('axios');

function normalizeUrl(rawUrl) {
  if (!rawUrl) return 'http://127.0.0.1:8000';
  let u = rawUrl.trim().replace(/\/$/, '');
  if (!u.startsWith('http://') && !u.startsWith('https://')) {
    u = `https://${u}`;
  }
  return u;
}

const ML_URL = normalizeUrl(process.env.ML_SERVER_URL);
const ML_TMT_URL = `${ML_URL}/api/predict-tmt`;

/**
 * Checks if a string represents an unprovided/missing template placeholder.
 * @param {string} str
 */
function isUnprovided(str) {
  if (!str || typeof str !== 'string') return true;
  return /^(?:not\s+(?:provided|specified|available|calculated|applicable|reported)|n\/?a|none(?:\s+reported)?|nil|unspecified|blank|[-_—\s]+)$/i.test(str.trim());
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
 * Parses full text into individual pages with page numbers.
 * Supports native OCR markers `-- (\d+) of (\d+) --` and form-feed delimiters.
 * @param {string} fullText
 */
function parsePages(fullText) {
  if (!fullText) return [];
  const pageRegex = /-- (\d+) of (\d+) --/g;
  const pages = [];
  let match;
  let lastIndex = 0;
  let lastPageNum = 1;

  while ((match = pageRegex.exec(fullText)) !== null) {
    if (lastIndex > 0) {
      pages.push({ pageNum: lastPageNum, text: fullText.substring(lastIndex, match.index) });
    }
    lastPageNum = parseInt(match[1], 10);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < fullText.length) {
    pages.push({ pageNum: lastPageNum, text: fullText.substring(lastIndex) });
  }

  if (pages.length === 0) {
    const ffPages = fullText.split(/\f+/);
    if (ffPages.length > 1) {
      return ffPages.map((pText, i) => ({ pageNum: i + 1, text: pText }));
    }
    return [{ pageNum: 1, text: fullText }];
  }
  return pages;
}

/**
 * Filters out completely unrelated clinical check-up pages (blood, urine, X-rays, invoices)
 * and isolates TMT-relevant pages.
 * @param {Array<{pageNum: number, text: string}>} allPages
 */
function filterTmtPages(allPages) {
  if (allPages.length <= 1) return allPages;

  const tmtPages = allPages.filter(p => {
    const t = p.text.toLowerCase();
    const hasTmtKeywords = (
      t.includes('treadmill') ||
      t.includes('bruce') ||
      t.includes('exercise stress') ||
      t.includes('exercise test') ||
      t.includes('stress test') ||
      t.includes('total exercise time') ||
      t.includes('exercise time') ||
      t.includes('maximum workload') ||
      t.includes('maximum work load') ||
      t.includes('hr achieved') ||
      t.includes('myocardial ischaemia') ||
      t.includes('myocardial ischemia') ||
      t.includes('stage 1') ||
      t.includes('stage 2') ||
      t.includes('peak exercise') ||
      t.includes('inducible ischemia') ||
      t.includes('duke treadmill') ||
      t.includes('mets')
    );

    const isUnrelated = (
      t.includes('x-ray chest') ||
      t.includes('complete blood count') ||
      t.includes('haemogram') ||
      t.includes('urine routine') ||
      t.includes('thyroid stimulating hormone') ||
      t.includes('fasting glucose') ||
      t.includes('fasting blood sugar') ||
      t.includes('glycated haemoglobin') ||
      t.includes('appointment email') ||
      t.includes('agreement of') ||
      t.includes('patient invoice')
    ) && !t.includes('treadmill test') && !t.includes('total exercise time') && !t.includes('exercise stress');

    return hasTmtKeywords && !isUnrelated;
  });

  return tmtPages.length > 0 ? tmtPages : allPages;
}

/**
 * Detects if an uploaded report intended for TMT is actually an ECG or other clinical document.
 * @param {string} text
 * @param {Array<{pageNum: number, text: string}>} pages
 */
function detectDocumentMismatch(text, pages = []) {
  if (!text || typeof text !== 'string') return null;

  const tmtKeywords = [
    /\btreadmill\b/i,
    /\btmt\b/i,
    /\bexercise\s+(?:stress|tolerance|ecg|test)\b/i,
    /\bstress\s+test\b/i,
    /\bbruce(?:\s+protocol)?\b/i,
    /\bmets\b/i,
    /\bmaximum\s+work\s*load\b/i,
    /\bworkload\b/i,
    /\bstage\s+[1-5]\b/i,
    /\bmax(?:imum)?\s+(?:heart\s+rate|hr)(?:\s+achieved)?\b/i,
    /\bpeak\s+(?:heart\s+rate|hr)\b/i,
    /\bexercise\s+(?:duration|time)\b/i,
    /\btarget\s+hr\b/i,
    /\b%?\s*mphr\b/i,
    /\b(?:inducible|provocable)\s+ischa?emia\b/i,
    /\bduke\s+treadmill\s+score\b/i,
    /\bexercise[\s-]induced\b/i
  ];

  const ecgKeywords = [
    /\b(?:pr|p-r)\s*(?:interval|[:=])\b/i,
    /\bqrs\s*(?:duration|width|complex|[:=])\b/i,
    /\b(?:qt\s*[\/|]\s*qtc|qi\/qtc)\b/i,
    /\bqtc\s*(?:interval|[:=])\b/i,
    /\bp[\s\/]qrs[\s\/]t\b/i,
    /\brv[1-6]\s*[\/|\+]\s*sv[1-6]\b/i,
    /\b25\s*mm\/s\b/i,
    /\b10\s*mm\/mv\b/i,
    /\b12[\s-]lead\s+(?:electrocardiogram|ecg|ekg)\b/i,
    /\bsinus\s+(?:arrhythmia|bradycardia|tachycardia|rhythm)\b/i,
    /\bflat\s+t\s+wave\b/i,
    /\bsemip\b/i,
    /\bventricular\s+rate\b/i
  ];

  const tmtMatches = tmtKeywords.filter(re => re.test(text)).length;
  const ecgMatches = ecgKeywords.filter(re => re.test(text)).length;

  if (ecgMatches >= 2 && tmtMatches === 0) {
    return {
      isMismatch: true,
      detectedType: 'ECG',
      message: 'This appears to be an ECG report, not a TMT report. Please upload the correct document.'
    };
  }

  return null;
}

/**
 * Parses raw text from a TMT report and extracts structured exercise stress parameters.
 * Supports multi-page checkups, image OCR reports, and extracts page references.
 * Never fabricates missing values or uncalculated Duke Treadmill Scores.
 * @param {string} text
 */
function parseTmtText(text) {
  if (!text || typeof text !== 'string') {
    return {
      extractionStatus: 'empty',
      isMismatch: false,
      fields: getEmptyFields(),
      reportedConclusion: null,
      summary: null,
      extractedFieldsSummary: [],
      missingFieldsSummary: [],
      warnings: ['No readable text found in TMT report.']
    };
  }

  const cleanText = cleanReportText(text);
  const allPages = parsePages(cleanText);

  // Document mismatch detection
  const mismatch = detectDocumentMismatch(cleanText, allPages);
  if (mismatch) {
    return {
      extractionStatus: 'document_mismatch',
      isMismatch: true,
      detectedType: mismatch.detectedType,
      fields: getEmptyFields(),
      reportedConclusion: null,
      summary: null,
      extractedFieldsSummary: [],
      missingFieldsSummary: [
        'Peak Heart Rate (thalach)',
        'Exercise Duration',
        'Workload (METs)',
        'ST Depression (oldpeak)',
        'Peak ST Segment Slope',
        'Exercise-Induced Angina'
      ],
      warnings: [mismatch.message]
    };
  }

  const tmtPages = filterTmtPages(allPages);

  // 1. Exercise Protocol
  let protocol = null;
  let protocolPage = null;
  let protocolRaw = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:protoc[ao]l\s+(?:used\s+)?[:=]?\s*|protocol:\s*|according\s+to\s+the\s+)(bruce|modified\s+bruce|naughton|balke)/i);
    if (m) {
      protocol = m[1].toLowerCase().includes('bruce') ? 'Standard Bruce' : m[1];
      protocolRaw = m[1];
      protocolPage = p.pageNum;
      break;
    }
  }
  if (!protocol) {
    for (const p of tmtPages) {
      if (/modified\s+bruce/i.test(p.text)) {
        protocol = 'Modified Bruce';
        protocolRaw = 'Modified Bruce';
        protocolPage = p.pageNum;
        break;
      } else if (/bruce/i.test(p.text)) {
        protocol = 'Standard Bruce';
        protocolRaw = 'Bruce';
        protocolPage = p.pageNum;
        break;
      }
    }
  }

  // 2. Exercise Duration (minutes)
  let exerciseDurationMinutes = null;
  let durationFormatted = null;
  let durationPage = null;
  let durationRaw = null;
  for (const p of tmtPages) {
    const lineMatch = p.text.match(/(?:total\s+exercise\s+time|exercise\s+time|total\s+(?:exercise\s+)?duration|duration|exercise\s+duration)\s*(?:\([^)]*\))?\s*[:=]?\s*(?:(\d{1,2}):(\d{2})|(\d{1,2}(?:\.\d{1,2})?)\s*(?:min(?:ute)?s?)?(?:\s*(\d{1,2})\s*sec)?)/i);
    if (lineMatch) {
      if (lineMatch[1] !== undefined && lineMatch[2] !== undefined) {
        const mins = Number.parseInt(lineMatch[1], 10);
        const secs = Number.parseInt(lineMatch[2], 10);
        const total = Number((mins + secs / 60).toFixed(2));
        if (Number.isFinite(total) && total > 0 && total <= 60) {
          exerciseDurationMinutes = total;
          durationFormatted = `${lineMatch[1].padStart(2, '0')}:${lineMatch[2].padStart(2, '0')}`;
          durationRaw = `${durationFormatted} (${total} min)`;
          durationPage = p.pageNum;
          break;
        }
      } else if (lineMatch[3] !== undefined) {
        const mins = Number.parseFloat(lineMatch[3]);
        const secs = lineMatch[4] ? Number.parseInt(lineMatch[4], 10) : 0;
        const total = Number((mins + secs / 60).toFixed(2));
        if (Number.isFinite(total) && total > 0 && total <= 60) {
          exerciseDurationMinutes = total;
          durationFormatted = secs > 0
            ? `${Math.floor(mins).toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
            : `${mins}:00`;
          durationRaw = `${durationFormatted} (${total} min)`;
          durationPage = p.pageNum;
          break;
        }
      }
    }
  }

  // 3. Workload Achieved (METs)
  let mets = null;
  let metsPage = null;
  let metsRaw = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:maximum\s+work\s*load|maximum\s+workload|work\s+level\s+of\s+max\.?\s*mets?|workload|mets?\s*(?:achieved)?|functional\s+capacity)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{1,2}[:.]\d{1,2})\s*(?:mets?)?/i);
    if (m) {
      const num = Number.parseFloat(m[1].replace(':', '.'));
      if (Number.isFinite(num) && num >= 1.0 && num <= 30.0) {
        mets = num;
        metsRaw = `${m[1]} METs`;
        metsPage = p.pageNum;
        break;
      }
    }
  }

  // 4. Resting Heart Rate (restingHR)
  let restingHr = null;
  let restingHrPage = null;
  let restingHrRaw = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:resting\s+heart\s+rate\s+of|hr\s+at\s+rest|rest(?:ing)?\s+(?:heart\s+rate|hr)|basal\s+hr)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{2,3})(?!\d)/i);
    if (m) {
      const num = Number.parseInt(m[1], 10);
      if (Number.isFinite(num) && num >= 35 && num <= 200) {
        restingHr = num;
        restingHrRaw = `${num} bpm`;
        restingHrPage = p.pageNum;
        break;
      }
    }
  }

  // 5. Peak/Maximum Heart Rate (thalach)
  let peakHr = null;
  let peakHrPage = null;
  let peakHrRaw = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:maximal\s+heart\s+rate\s+of|hr\s+achieved|max(?:imum)?\s+(?:heart\s+rate|hr)(?:\s+achieved)?|peak\s+(?:heart\s+rate|hr)|thalach|max\s+hr\s+achieved)\s*(?:\([^)]*\))?\s*[:=]?\s*(\d{2,3})(?!\d)/i);
    if (m) {
      const num = Number.parseInt(m[1], 10);
      if (Number.isFinite(num) && num >= 40 && num <= 250) {
        peakHr = num;
        peakHrRaw = `${num} bpm`;
        peakHrPage = p.pageNum;
        break;
      }
    }
  }

  // 6. Resting Blood Pressure
  let restingBP = null;
  let restingBpPage = null;
  let restingBpRaw = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:resting\s+blood\s+pressure\s+of|bp\s+at\s+rest|rest(?:ing)?\s+bp)\s*[:=]?\s*(\d{2,3}\s*\/\s*\d{2,3})/i);
    if (m) {
      restingBP = m[1].replace(/\s+/g, '');
      restingBpRaw = `${restingBP} mmHg`;
      restingBpPage = p.pageNum;
      break;
    }
  }

  // 7. Peak Exercise Blood Pressure
  let peakBP = null;
  let peakBpPage = null;
  let peakBpRaw = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:maximum\s+blood\s+pressure\s+of|max(?:imum)?\s+bp|peak\s+(?:exercise\s+)?bp|stage\s+3\s+bp)\s*[:=]?\s*(\d{2,3}\s*\/\s*\d{2,3})/i);
    if (m) {
      peakBP = m[1].replace(/\s+/g, '');
      peakBpRaw = `${peakBP} mmHg`;
      peakBpPage = p.pageNum;
      break;
    }
  }

  // 8. Target Heart Rate Achieved (%)
  let targetHrPercent = null;
  let targetHrPage = null;
  for (const p of tmtPages) {
    let m = p.text.match(/(?:target\s+(?:hr|heart\s+rate)\s*(?:achieved)?|%\s*of\s*target\s*hr|%\s*target|%\s*mphr|%\s*of\s*age-predicted\s*max(?:imum)?)\s*[:=]?\s*(\d{2,3})\s*%/i);
    if (!m) {
      m = p.text.match(/(\d{2,3})\s*%\s*(?:of\s*(?:age-predicted\s*)?max(?:imum)?|\s*target\s*hr|mphr)/i);
    }
    if (m) {
      const num = Number.parseInt(m[1], 10);
      if (Number.isFinite(num) && num >= 30 && num <= 150) {
        targetHrPercent = num;
        targetHrPage = p.pageNum;
        break;
      }
    }
  }

  // 9. ST Depression (oldpeak in mm)
  let oldpeak = null;
  let oldpeakPage = null;
  let oldpeakRaw = null;
  for (const p of tmtPages) {
    const maxDepMatch = p.text.match(/(?:maximum\s+depression)\s*[:=]+\s*([^\n\r]+)/i);
    const lineMatch = p.text.match(/(?:st[\s-]?(?:segment\s+)?depression|\boldpeak\b)\s*(?:\([^)]*\))?\s*[:=]+\s*([^\n\r]+)/i);
    const matchToUse = maxDepMatch || lineMatch;
    if (matchToUse) {
      const raw = matchToUse[1].trim();
      if (/^[-_—\s]+$/.test(raw) || /none|nil|absent|zero/i.test(raw)) {
        oldpeak = 0.0;
        oldpeakRaw = 'No depression reported';
        oldpeakPage = p.pageNum;
        break;
      } else if (!isUnprovided(raw)) {
        const numMatch = raw.match(/(\d{1,2}(?:\.\d{1,2})?)/);
        if (numMatch) {
          const num = Number.parseFloat(numMatch[1]);
          if (Number.isFinite(num) && num >= 0.0 && num <= 10.0) {
            oldpeak = num;
            oldpeakRaw = `${num} mm`;
            oldpeakPage = p.pageNum;
            break;
          }
        }
      }
    }
    // Explicit phrase on line
    if (/\b(?:no|nil|zero)\s+st[\s-]?(?:segment\s+)?depression\b/i.test(p.text)) {
      oldpeak = 0.0;
      oldpeakRaw = 'No depression reported';
      oldpeakPage = p.pageNum;
      break;
    }
  }

  // 10. Peak ST Segment Slope (1 = Upsloping, 2 = Flat, 3 = Downsloping)
  let slope = null;
  let slopePage = null;
  let slopeRaw = null;
  for (const p of tmtPages) {
    const lineMatch = p.text.match(/(?:peak\s+st[\s-]?(?:segment\s+)?slope|st\s+slope|\bslope\b)\s*(?:\([^)]*\))?\s*[:=]\s*([^\n\r]+)/i);
    if (lineMatch) {
      const raw = lineMatch[1].trim();
      if (!isUnprovided(raw)) {
        if (/down[\s-]?sloping|3/i.test(raw)) { slope = 3; slopeRaw = 'Downsloping'; slopePage = p.pageNum; break; }
        if (/flat|horizontal|2/i.test(raw)) { slope = 2; slopeRaw = 'Flat / Horizontal'; slopePage = p.pageNum; break; }
        if (/up[\s-]?sloping|1/i.test(raw)) { slope = 1; slopeRaw = 'Upsloping'; slopePage = p.pageNum; break; }
      }
    }
  }

  // 11. Exercise-Induced Angina (exang: 0 = No, 1 = Yes)
  let exang = null;
  let exangPage = null;
  let exangRaw = null;
  for (const p of tmtPages) {
    const lineMatch = p.text.match(/(?:symptoms\s+on\s+stress|exercise[\s-]?(?:induced\s+)?angina)\s*(?:\([^)]*\))?\s*[:=]\s*([^\n\r]+)/i);
    const chestPainMatch = p.text.match(/summary:\s*chest\s+pain:\s*([^\n\r]+)/i);

    if (lineMatch) {
      const raw = lineMatch[1].trim();
      if (/^[-_—\s]+$/.test(raw) || /none|nil|negative|absent|no/i.test(raw)) {
        exang = 0;
        exangRaw = 'No symptoms reported';
        exangPage = p.pageNum;
        break;
      }
      if (/yes|present|positive|induced|limiting/i.test(raw)) {
        exang = 1;
        exangRaw = 'Angina induced';
        exangPage = p.pageNum;
        break;
      }
    }
    if (chestPainMatch) {
      const raw = chestPainMatch[1].trim();
      if (/none|nil|negative|absent|no/i.test(raw)) {
        exang = 0;
        exangRaw = 'No symptoms reported';
        exangPage = p.pageNum;
        break;
      }
    }
  }
  if (exang === null) {
    for (const p of tmtPages) {
      if (/no\s+(?:angina|chest\s+pain)/i.test(p.text) || /negative\s+for\s+(?:angina|chest\s+pain)/i.test(p.text)) {
        exang = 0;
        exangRaw = 'No symptoms reported';
        exangPage = p.pageNum;
        break;
      }
      if (/(?:chest\s+pain|angina)\s+(?:during|induced\s+by)\s+exercise/i.test(p.text)) {
        exang = 1;
        exangRaw = 'Angina induced';
        exangPage = p.pageNum;
        break;
      }
    }
  }

  // 12. Resting ECG Finding (0 = Normal, 1 = ST-T abnormality, 2 = LVH)
  let restecg = null;
  let restecgPage = null;
  let restecgRaw = null;

  // First search for dedicated resting ECG pages in the dossier
  const restingEcgPageObj = allPages.find(p => {
    const t = p.text.toLowerCase();
    return (t.includes('ecg report') || t.includes('12-lead') || t.includes('electrocardiogram') || t.includes('normal sinus rhythm')) &&
           (t.includes('left ventricular hypertrophy') || t.includes('lvh') || t.includes('pr interval') || t.includes('qrs duration'));
  });

  const pagesToCheckForRestEcg = restingEcgPageObj ? [restingEcgPageObj, ...tmtPages] : tmtPages;
  for (const p of pagesToCheckForRestEcg) {
    const t = p.text.toLowerCase();
    if (t.includes('voltage criteria for left ventricular hypertrophy') || /\blvh\b/i.test(p.text)) {
      restecg = 2;
      restecgRaw = 'Left ventricular hypertrophy (LVH)';
      restecgPage = p.pageNum;
      break;
    }
    const lineMatch = p.text.match(/(?:resting\s+ecg(?:\s+finding)?|restecg)\s*(?:\([^)]*\))?\s*[:=]\s*([^\n\r]+)/i);
    if (lineMatch) {
      const raw = lineMatch[1].trim();
      if (!isUnprovided(raw)) {
        if (/left\s+ventricular\s+hypertrophy|lvh|2/i.test(raw)) {
          restecg = 2;
          restecgRaw = 'Left ventricular hypertrophy (LVH)';
          restecgPage = p.pageNum;
          break;
        }
        if (/st[\s-]?t\s+(?:wave\s+)?abnormal|t-?wave\s+changes|1/i.test(raw)) {
          restecg = 1;
          restecgRaw = 'ST-T abnormality';
          restecgPage = p.pageNum;
          break;
        }
        if (/normal|wnl|0/i.test(raw)) {
          restecg = 0;
          restecgRaw = 'Normal sinus rhythm';
          restecgPage = p.pageNum;
          break;
        }
      }
    }
  }

  // 13. Interpretation & Conclusion
  let tmtResult = null;
  let reportedConclusion = null;
  let conclusionPage = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:reported\s+exercise\s+conclusion\s*\/?\s*diagnosis|conclusion|impression|final\s+result|diagnosis)\s*[:=]\s*([^\n\r]+(?:\n[^\n\r]+)?)/i);
    if (m && m[1]) {
      const raw = m[1].replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').split(/\b(?:Clinical note|This report template|Signed by|\*\*END|Checked by|Technician|Physician|Dr\.)\b/i)[0].trim().replace(/^[:=\s]+/, '');
      if (!isUnprovided(raw)) {
        if (/negative\s+for\s+(?:provocable\s+|inducible\s+)?(?:myocardial\s+)?ischa?emia/i.test(raw) || /stress\s+test\s+is\s+negative/i.test(raw)) {
          tmtResult = 'Negative for inducible ischemia';
          reportedConclusion = 'Stress test is negative for provocable myocardial ischaemia.';
          conclusionPage = p.pageNum;
          break;
        } else if (/positive\s+for\s+(?:provocable\s+|inducible\s+)?(?:myocardial\s+)?ischa?emia/i.test(raw) || /stress\s+test\s+is\s+positive/i.test(raw)) {
          tmtResult = 'Positive for inducible ischemia';
          reportedConclusion = raw;
          conclusionPage = p.pageNum;
          break;
        } else {
          reportedConclusion = raw;
          conclusionPage = p.pageNum;
          break;
        }
      }
    }
  }

  // 14. Duke Treadmill Score (DTS) - DO NOT calculate or fabricate if not reported
  let reportedDts = null;
  let dtsPage = null;
  for (const p of tmtPages) {
    const m = p.text.match(/(?:duke\s+treadmill\s+score|dts)\s*[:=]\s*([+-]?\d+(?:\.\d+)?)/i);
    if (m) {
      reportedDts = Number.parseFloat(m[1]);
      dtsPage = p.pageNum;
      break;
    }
  }

  const durationField = {
    value: exerciseDurationMinutes,
    formatted: durationFormatted,
    unit: 'minutes',
    status: exerciseDurationMinutes !== null ? 'extracted' : 'not_found',
    page: durationPage,
    rawText: durationFormatted || durationRaw
  };

  const restingHrField = {
    value: restingHr,
    unit: 'bpm',
    status: restingHr !== null ? 'extracted' : 'not_found',
    page: restingHrPage,
    rawText: restingHrRaw
  };

  const fields = {
    thalach: {
      value: peakHr,
      unit: 'bpm',
      status: peakHr !== null ? 'extracted' : 'not_found',
      page: peakHrPage,
      rawText: peakHrRaw
    },
    restingHr: restingHrField,
    restingHR: restingHrField,
    restingBP: {
      value: restingBP,
      unit: 'mmHg',
      status: restingBP !== null ? 'extracted' : 'not_found',
      page: restingBpPage,
      rawText: restingBpRaw
    },
    peakBP: {
      value: peakBP,
      unit: 'mmHg',
      status: peakBP !== null ? 'extracted' : 'not_found',
      page: peakBpPage,
      rawText: peakBpRaw
    },
    targetHrPercent: {
      value: targetHrPercent,
      unit: '%',
      status: targetHrPercent !== null ? 'extracted' : 'not_found',
      page: targetHrPage
    },
    mets: {
      value: mets,
      unit: 'METs',
      status: mets !== null ? 'extracted' : 'not_found',
      page: metsPage,
      rawText: metsRaw
    },
    exerciseDurationMinutes: durationField,
    durationMinutes: durationField,
    durationFormatted: {
      value: durationFormatted,
      unit: 'min:s',
      status: durationFormatted !== null ? 'extracted' : 'not_found',
      page: durationPage,
      rawText: durationFormatted
    },
    exang: {
      value: exang,
      unit: '',
      status: exang !== null ? 'extracted' : 'not_found',
      page: exangPage,
      rawText: exangRaw
    },
    oldpeak: {
      value: oldpeak,
      unit: 'mm',
      status: oldpeak !== null ? 'extracted' : 'not_found',
      page: oldpeakPage,
      rawText: oldpeakRaw
    },
    slope: {
      value: slope,
      unit: '',
      status: slope !== null ? 'extracted' : 'not_found',
      page: slopePage,
      rawText: slopeRaw
    },
    restecg: {
      value: restecg,
      unit: '',
      status: restecg !== null ? 'extracted' : 'not_found',
      page: restecgPage,
      rawText: restecgRaw
    },
    protocol: {
      value: protocol,
      unit: '',
      status: protocol !== null ? 'extracted' : 'not_found',
      page: protocolPage,
      rawText: protocolRaw
    },
    conclusion: {
      value: reportedConclusion,
      unit: '',
      status: reportedConclusion !== null ? 'extracted' : 'not_found',
      page: conclusionPage
    },
    tmtResult: {
      value: tmtResult,
      unit: '',
      status: tmtResult !== null ? 'extracted' : 'not_found',
      page: conclusionPage
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
    fields.protocol,
    fields.conclusion
  ];

  const fieldSummaryDefs = [
    { key: 'protocol', label: 'Exercise Protocol' },
    { key: 'durationMinutes', label: 'Exercise Duration' },
    { key: 'mets', label: 'Workload Achieved (METs)' },
    { key: 'restingHR', label: 'Resting Heart Rate' },
    { key: 'thalach', label: 'Peak Heart Rate (thalach)' },
    { key: 'restingBP', label: 'Resting Blood Pressure' },
    { key: 'peakBP', label: 'Peak Exercise BP' },
    { key: 'exang', label: 'Exercise-Induced Angina' },
    { key: 'oldpeak', label: 'ST Depression (oldpeak)' },
    { key: 'slope', label: 'Peak ST Segment Slope' },
    { key: 'restecg', label: 'Resting ECG Finding' },
    { key: 'conclusion', label: 'Reported Conclusion' }
  ];

  const extractedFieldsSummary = [];
  const missingFieldsSummary = [];

  for (const def of fieldSummaryDefs) {
    if (fields[def.key] && fields[def.key].status === 'extracted') {
      const pageInfo = fields[def.key].page ? ` (p. ${fields[def.key].page})` : '';
      extractedFieldsSummary.push(`${def.label}${pageInfo}`);
    } else {
      missingFieldsSummary.push(def.label);
    }
  }

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

  const clinicalExtraction = {
    status: extractionStatus,
    extractedCount: extractedFieldsSummary.length,
    unreportedCount: missingFieldsSummary.length,
    statusText: extractedCount >= 8
      ? `${extractedFieldsSummary.length} Extracted · ${missingFieldsSummary.length} Clinically Unreported`
      : `${extractedFieldsSummary.length} Extracted · ${missingFieldsSummary.length} Missing`
  };

  return {
    extractionStatus,
    isMismatch: false,
    detectedType: null,
    fields,
    durationFormatted,
    clinicalExtraction,
    tmtResult,
    reportedConclusion,
    reportedDts,
    summary: reportedConclusion,
    extractedFieldsSummary,
    missingFieldsSummary,
    warnings
  };
}

function getEmptyFields() {
  const notFound = (unit = '') => ({ value: null, unit, status: 'not_found', page: null, rawText: null });
  const durField = notFound('minutes');
  const hrField = notFound('bpm');

  return {
    thalach: hrField,
    restingHr: hrField,
    restingHR: hrField,
    restingBP: notFound('mmHg'),
    peakBP: notFound('mmHg'),
    targetHrPercent: notFound('%'),
    mets: notFound('METs'),
    exerciseDurationMinutes: durField,
    durationMinutes: durField,
    exang: notFound(''),
    oldpeak: notFound('mm'),
    slope: notFound(''),
    restecg: notFound(''),
    protocol: notFound(''),
    conclusion: notFound(''),
    tmtResult: notFound('')
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
  // Only calculated if duration and oldpeak are provided and not explicitly omitted
  const rawDukeScore = (tmtInput.computeDts !== false && duration != null && oldpeak != null)
    ? computeDukeScore(duration, oldpeak, exang)
    : null;

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
      label: mlInference.cad_prediction === 1 ? 'Positive for Obstructive CAD (≥ 50% Stenosis)' : 'Negative for Obstructive CAD (< 50% Stenosis)',
      confidence: mlInference.confidence,
      riskProbability: mlInference.cad_probability,
      modelName: 'UCI Cleveland CAD Random Forest Classifier (5-Fold CV ROC-AUC: 0.857)',
      featuresEvaluated: mlInference.features_evaluated || {
        age: tmtInput.age != null ? Number(tmtInput.age) : null,
        sex: tmtInput.sex != null ? Number(tmtInput.sex) : null,
        restecg: restecg != null ? restecg : 0,
        thalach,
        exang: exang !== null ? exang : 0,
        oldpeak,
        slope: slope !== null ? slope : 2
      }
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
    demographics: {
      age: tmtInput.age != null ? Number(tmtInput.age) : null,
      sex: tmtInput.sex != null ? Number(tmtInput.sex) : null
    },
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
  computeDukeScore,
  detectDocumentMismatch
};
