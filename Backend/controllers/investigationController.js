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
  const ecgExtraction = ecgService.parseEcgText(pdfResult.text);

  // Combine warnings
  const warnings = [...pdfResult.warnings, ...ecgExtraction.warnings];

  // If text was too short or scanned, add note
  if (pdfResult.isScanned) {
    warnings.push(
      'Document appears to contain scanned or image-based pages. Automated text extraction may be incomplete. Please verify or manually enter measurements.'
    );
  }

  res.json({
    success: true,
    documentType: 'ECG',
    fileName: fileName,
    pageCount: pdfResult.pageCount,
    extractionStatus: ecgExtraction.extractionStatus,
    isScanned: pdfResult.isScanned,
    fields: ecgExtraction.fields,
    reportedDiagnosis: ecgExtraction.reportedDiagnosis,
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

  // Combine warnings
  const warnings = [...pdfResult.warnings, ...tmtExtraction.warnings];

  if (pdfResult.isScanned) {
    warnings.push(
      'Document appears to contain scanned pages or graphical stress curves. Automated text extraction may be incomplete. Please verify or manually enter measurements.'
    );
  }

  res.json({
    success: true,
    documentType: 'TMT',
    fileName: fileName,
    pageCount: pdfResult.pageCount,
    extractionStatus: tmtExtraction.extractionStatus,
    isScanned: pdfResult.isScanned,
    fields: tmtExtraction.fields,
    reportedConclusion: tmtExtraction.reportedConclusion,
    warnings: warnings,
    extractedAt: new Date().toISOString(),
  });
});

module.exports = {
  upload,
  parseEcgReport,
  parseTmtReport,
};
