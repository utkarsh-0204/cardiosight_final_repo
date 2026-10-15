// =============================================================================
// Investigation routes for ECG & TMT upload and parsing.
// =============================================================================
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const investigation = require('../controllers/investigationController');

// Multer error handling wrapper
function handleUpload(uploadMiddleware) {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        return next(err);
      }
      next();
    });
  };
}

router.post(
  '/parse-ecg',
  authenticate,
  handleUpload(investigation.upload.single('file')),
  investigation.parseEcgReport
);

router.post(
  '/parse-tmt',
  authenticate,
  handleUpload(investigation.upload.single('file')),
  investigation.parseTmtReport
);

module.exports = router;
