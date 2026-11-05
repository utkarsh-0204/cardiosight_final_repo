// =============================================================================
// Admin routes (strictly require authenticated admin role).
// =============================================================================
const router = require('express').Router();
const admin = require('../controllers/adminController');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/role');

const adminOnly = [authenticate, requireRole('admin')];

// Overview & Analytics
router.get('/admin/stats', adminOnly, admin.getStats);
router.get('/admin/activities', adminOnly, admin.getActivities);
router.get('/admin/health', adminOnly, admin.getSystemHealth);
router.get('/admin/audit-logs', adminOnly, admin.getAuditLogs);

// User Management
router.get('/admin/users', adminOnly, admin.getUsers);
router.get('/admin/users/:id', adminOnly, admin.getUserDetails);
router.get('/admin/users/:id/predictions', adminOnly, admin.getUserPredictions);
router.patch('/admin/users/:id/status', adminOnly, admin.updateUserStatus);
router.delete('/admin/users/:id', adminOnly, admin.deleteUser);

// Prediction Monitoring
router.get('/admin/predictions', adminOnly, admin.getPredictions);

module.exports = router;
