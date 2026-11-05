// =============================================================================
// Dashboard & analytics routes.
// =============================================================================
const router = require('express').Router();
const dashboard = require('../controllers/dashboardController');
const analytics = require('../controllers/analyticsController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

router.get('/dashboard', authenticate, dashboard.getSummary);
router.get('/dashboard/notifications', authenticate, dashboard.getNotifications);
router.get('/dashboard/activities', authenticate, dashboard.getActivities);
router.get('/dashboard/tips', authenticate, dashboard.getHealthTips);

// Platform-wide analytics is an administrative function restricted to ADMIN role only
router.get('/analytics', authenticate, requireRole('admin'), analytics.getAnalytics);

module.exports = router;
