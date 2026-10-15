// =============================================================================
// PDF Extraction Service
// Secure file validation, magic-byte inspection, size limits, and text parsing.
// =============================================================================

const pdfParse = require('pdf-parse');

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB limit
const PDF_MAGIC_BYTES = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

class PdfValidationError extends Error {
  constructor(message, code = 'INVALID_PDF') {
    super(message);
    this.name = 'PdfValidationError';
    this.code = code;
    this.status = 400;
  }
}

/**
 * Validates PDF buffer signature, size, and integrity.
 * @param {Buffer} buffer
 * @param {string} originalname
 */
function validatePdfBuffer(buffer, originalname = 'report.pdf') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new PdfValidationError('No file data provided.');
  }

  if (buffer.length === 0) {
    throw new PdfValidationError('Uploaded file is empty.');
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new PdfValidationError(
      `File size (${(buffer.length / (1024 * 1024)).toFixed(1)} MB) exceeds maximum allowed limit (10 MB).`
    );
  }

  // Validate magic bytes (%PDF-)
  if (buffer.length < 4 || !buffer.subarray(0, 4).equals(PDF_MAGIC_BYTES)) {
    throw new PdfValidationError(
      'Invalid file format. The file signature does not match a valid PDF document.'
    );
  }

  // Sanitize filename
  const cleanName = String(originalname).replace(/[^a-zA-Z0-9._-]/g, '_');
  return { valid: true, cleanName, sizeBytes: buffer.length };
}

async function parsePdfData(buffer) {
  if (typeof pdfParse === 'function') {
    return await pdfParse(buffer, { max: 20 });
  } else if (pdfParse && pdfParse.PDFParse) {
    const parser = new pdfParse.PDFParse({ data: buffer });
    const textRes = await parser.getText();
    return {
      text: textRes.text || '',
      numpages: textRes.total || (textRes.pages ? textRes.pages.length : 1),
    };
  }
  throw new Error('No PDF parsing engine available');
}

/**
 * Extracts text from a validated PDF buffer.
 * Detects whether the PDF contains digital text or is a scanned/raster document.
 * @param {Buffer} buffer
 * @param {string} originalname
 */
async function extractTextFromPdf(buffer, originalname = 'report.pdf') {
  validatePdfBuffer(buffer, originalname);

  try {
    const data = await parsePdfData(buffer);

    const rawText = data.text ? data.text.trim() : '';
    const numPages = data.numpages || 1;

    // A document with very little text (< 40 chars) across multiple pages is typically scanned/image-only
    const isScanned = rawText.replace(/\s+/g, '').length < 40;

    return {
      success: true,
      filename: originalname,
      numPages,
      pageCount: numPages,
      textLength: rawText.length,
      isScanned,
      text: rawText,
      rawText,
      warnings: isScanned
        ? ['Document appears to be a scanned or image-based PDF. Automated text extraction may be limited. Please verify or manually enter clinical values.']
        : []
    };
  } catch (err) {
    if (err.name === 'PasswordException' || /password/i.test(err.message)) {
      throw new PdfValidationError('Password-protected or encrypted PDFs are not supported. Please upload an unencrypted document.', 'ENCRYPTED_PDF');
    }
    throw new PdfValidationError(`Failed to parse PDF document: ${err.message}`, 'CORRUPTED_PDF');
  }
}

module.exports = {
  validatePdfBuffer,
  extractTextFromPdf,
  PdfValidationError,
  MAX_FILE_SIZE_BYTES
};
