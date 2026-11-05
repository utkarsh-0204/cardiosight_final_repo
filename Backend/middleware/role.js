// =============================================================================
// Role-based authorization middleware.
// Normalizes and compares roles case-insensitively.
// =============================================================================
function requireRole(...roles) {
  const allowed = roles.map((r) => String(r).toLowerCase().trim());
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const userRole = String(req.user.role || '').toLowerCase().trim();
    if (!allowed.includes(userRole)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions for this action.' });
    }
    next();
  };
}

module.exports = { requireRole };
