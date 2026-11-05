// =============================================================================
// CardioSight Investigation Controller (ECG & TMT PDF Report Extraction)
// =============================================================================
const multer = require('multer');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { extractTextFromPdf } = require('../services/pdfExtractorService');
const ecgService = require('../services/ecgService');
const tmtService = require('../services/tmtService');

// Multer memory storage configuration (in-memory buffer, max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDF mimetypes
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new HttpError(400, 'Invalid file type. Only PDF clinical reports are accepted.'), false);
    }
  },
});

/**
 * POST /api/investigations/parse-ecg
 * Accepts a PDF file upload and extracts clinical ECG parameters.
 */
const parseEcgReport = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    throw new HttpError(400, 'Please upload a valid ECG PDF report.');
  }

  const { filename, originalname, buffer } = req.file;
  const fileName = originalname || filename || 'ecg_report.pdf';

  // 1. Extract raw text from PDF
  const pdfResult = await extractTextFromPdf(buffer, fileName);

  // 2. Parse ECG parameters from extracted text
  const ecgExtraction = ecgService.parseEcgText(pdfResult.text, fileName);

  // Combine warnings - only include genuine warnings, do NOT add generic scanned warnings if OCR succeeded
  let warnings = [];
  if (pdfResult.isScanned && !pdfResult.ocrApplied) {
    warnings.push(
      'Document appears to contain scanned or image-based pages. Automated text extraction may be incomplete. Please verify or manually enter measurements.'
    );
  }
  if (ecgExtraction.warnings && ecgExtraction.warnings.length > 0) {
    warnings.push(...ecgExtraction.warnings);
  }

  const ecgOcrNotice = pdfResult.ocrApplied
    ? 'Scanned document detected. OCR was applied successfully. Please verify extracted clinical values.'
    : null;

  res.json({
    success: true,
    documentType: 'ECG',
    fileName: fileName,
    pageCount: pdfResult.pageCount,
    extractionStatus: ecgExtraction.extractionStatus,
    modality: ecgExtraction.modality,
    recordingDate: ecgExtraction.recordingDate || ecgExtraction.fields.recordingDate?.value || null,
    isScanned: pdfResult.isScanned,
    ocrApplied: pdfResult.ocrApplied || false,
    docProcessing: {
      isScanned: pdfResult.isScanned,
      ocrApplied: pdfResult.ocrApplied || false,
      ocrNotice: ecgOcrNotice,
      pageCount: pdfResult.pageCount,
      statusText: pdfResult.ocrApplied
        ? `Optical Character Recognition (OCR) applied (${pdfResult.pageCount} ${pdfResult.pageCount === 1 ? 'page' : 'pages'} scanned)`
        : `Digital PDF text parsed (${pdfResult.pageCount} ${pdfResult.pageCount === 1 ? 'page' : 'pages'})`
    },
    fields: ecgExtraction.fields,
    reportedDiagnosis: ecgExtraction.reportedDiagnosis,
    extractedFieldsSummary: ecgExtraction.extractedFieldsSummary,
    manualReviewFieldsSummary: ecgExtraction.manualReviewFieldsSummary || [],
    missingFieldsSummary: ecgExtraction.missingFieldsSummary,
    unsupportedFieldsSummary: ecgExtraction.unsupportedFieldsSummary,
    warnings: warnings,
    extractedAt: new Date().toISOString(),
  });
});

/**
 * POST /api/investigations/parse-tmt
 * Accepts a PDF file upload and extracts exercise stress test parameters.
 */
const parseTmtReport = asyncHandler(async (req, res) => {
  if (!req.file || !req.file.buffer) {
    throw new HttpError(400, 'Please upload a valid TMT PDF report.');
  }

  const { filename, originalname, buffer } = req.file;
  const fileName = originalname || filename || 'tmt_report.pdf';

  // 1. Extract raw text from PDF
  const pdfResult = await extractTextFromPdf(buffer, fileName);

  // 2. Parse TMT parameters from extracted text
  const tmtExtraction = tmtService.parseTmtText(pdfResult.text);

  // Combine warnings - if document mismatch, only show the mismatch message
  let warnings = [];
  if (tmtExtraction.isMismatch) {
    warnings = [...tmtExtraction.warnings];
  } else {
    // Only add OCR warning if document was scanned but OCR failed to extract text
    if (pdfResult.isScanned && !pdfResult.ocrApplied) {
      warnings.push(
        'Document appears to contain scanned pages or graphical stress curves. Automated text extraction may be incomplete. Please verify or manually enter measurements.'
      );
    }
    if (tmtExtraction.warnings && tmtExtraction.warnings.length > 0) {
      warnings.push(...tmtExtraction.warnings);
    }
  }

  const tmtOcrNotice = pdfResult.ocrApplied
    ? 'Scanned document detected. OCR was applied successfully. Please verify extracted clinical values.'
    : null;

  res.json({
    success: true,
    documentType: 'TMT',
    fileName: fileName,
    pageCount: pdfResult.pageCount,
    extractionStatus: tmtExtraction.extractionStatus,
    isMismatch: tmtExtraction.isMismatch || false,
    detectedType: tmtExtraction.detectedType || null,
    isScanned: pdfResult.isScanned,
    ocrApplied: pdfResult.ocrApplied || false,
    docProcessing: {
      isScanned: pdfResult.isScanned,
      ocrApplied: pdfResult.ocrApplied || false,
      ocrNotice: tmtOcrNotice,
      pageCount: pdfResult.pageCount,
      statusText: pdfResult.ocrApplied
        ? `Optical Character Recognition (OCR) applied (${pdfResult.pageCount} pages scanned)`
        : `Digital PDF text parsed (${pdfResult.pageCount} ${pdfResult.pageCount === 1 ? 'page' : 'pages'})`
    },
    clinicalExtraction: tmtExtraction.clinicalExtraction || {
      status: tmtExtraction.extractionStatus,
      extractedCount: (tmtExtraction.extractedFieldsSummary || []).length,
      unreportedCount: (tmtExtraction.missingFieldsSummary || []).length,
      statusText: `${(tmtExtraction.extractedFieldsSummary || []).length} Extracted · ${(tmtExtraction.missingFieldsSummary || []).length} Unreported`
    },
    durationFormatted: tmtExtraction.durationFormatted || tmtExtraction.fields?.durationMinutes?.formatted || null,
    fields: tmtExtraction.fields,
    tmtResult: tmtExtraction.tmtResult || null,
    reportedConclusion: tmtExtraction.reportedConclusion || null,
    reportedDts: tmtExtraction.reportedDts !== undefined ? tmtExtraction.reportedDts : null,
    extractedFieldsSummary: tmtExtraction.extractedFieldsSummary || [],
    manualReviewFieldsSummary: tmtExtraction.manualReviewFieldsSummary || [],
    missingFieldsSummary: tmtExtraction.missingFieldsSummary || [],
    warnings: warnings,
    extractedAt: new Date().toISOString(),
  });
});

module.exports = {
  upload,
  parseEcgReport,
  parseTmtReport,
};
