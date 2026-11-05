// =============================================================================
// Authentication controller – register, login, me, forgot/reset password,
// email verification. Token responses match the Angular AuthResponse contract.
// =============================================================================
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LIFETIME_MINUTES = 30;
const CODE_TTL_MS = CODE_LIFETIME_MINUTES * 60 * 1000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** DB row -> the User object the Angular frontend expects (camelCase). */
function serializeUser(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone || '',
    role: row.role,
    avatarColor: row.avatar_color,
    gender: row.gender,
    dateOfBirth: row.date_of_birth ? new Date(row.date_of_birth).toISOString().slice(0, 10) : '',
    heightCm: row.height_cm != null && Number(row.height_cm) > 0 ? Number(row.height_cm) : null,
    weightKg: row.weight_kg != null && Number(row.weight_kg) > 0 ? Number(row.weight_kg) : null,
    bloodGroup: row.blood_group || '',
    allergies: row.allergies || [],
    medications: row.medications || [],
    medicalConditions: row.medical_conditions || [],
    isEmailVerified: row.is_email_verified,
    isTest: Boolean(row.is_test),
    status: row.status || 'active',
    createdAt: new Date(row.created_at).toISOString(),
  };
}

/** Converts a JWT expires-in value (e.g. "7d") into seconds. */
function parseExpiry(expiresIn) {
  const numeric = Number(expiresIn);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = String(expiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 3600; // default 7d
  const mult = { s: 1, m: 60, h: 3600, d: 86400 }[match[2]];
  return Number(match[1]) * mult;
}

/** Signs a JWT and returns the AuthTokens shape. */
function signTokens(user) {
  const expiresInValue = process.env.JWT_EXPIRES_IN || '7d';
  const expiresIn = parseExpiry(expiresInValue);
  const accessToken = jwt.sign(
    { sub: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn }
  );
  return { accessToken, tokenType: 'Bearer', expiresIn };
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function storeCode(userId, purpose, code) {
  // Invalidate any previous unused codes of the same purpose.
  await pool.query(
    `UPDATE verification_codes
        SET used = TRUE
      WHERE user_id = $1 AND purpose = $2 AND used = FALSE`,
    [userId, purpose]
  );
  await pool.query(
    `INSERT INTO verification_codes (user_id, purpose, code_hash, expires_at)
     VALUES ($1, $2, $3, now() + ($4 || ' milliseconds')::interval)`,
    [userId, purpose, hashCode(code), CODE_TTL_MS]
  );
}

async function findUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  return rows[0] || null;
}

/** Look up a code, verifying hash + purpose + expiry. Marks it used on success. */
async function consumeCode(userId, purpose, code, { markUsed = true } = {}) {
  const { rows } = await pool.query(
    `SELECT id FROM verification_codes
      WHERE user_id = $1 AND purpose = $2 AND code_hash = $3
        AND used = FALSE AND expires_at > now()
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId, purpose, hashCode(code)]
  );
  if (rows.length === 0) return false;
  if (markUsed) {
    await pool.query('UPDATE verification_codes SET used = TRUE WHERE id = $1', [rows[0].id]);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { firstName, lastName, email, password, phone, gender, role } = req.body || {};

  // Reject explicit elevation to non-patient roles during registration
  if (role !== undefined) {
    const incomingRole = String(role).toLowerCase().trim();
    if (incomingRole !== 'patient') {
      throw new HttpError(403, 'Forbidden: Self-registration as administrator is not permitted.');
    }
  }

  if (!firstName || !String(firstName).trim()) throw new HttpError(400, 'First name is required.');
  if (!lastName || !String(lastName).trim()) throw new HttpError(400, 'Last name is required.');
  if (!email || !EMAIL_RE.test(String(email))) throw new HttpError(400, 'A valid email address is required.');
  if (!password || String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');
  if (gender && !['male', 'female', 'other'].includes(gender)) throw new HttpError(400, 'Invalid gender value.');

  const existing = await findUserByEmail(email);
  if (existing) throw new HttpError(409, 'An account with this email already exists.');

  const passwordHash = await bcrypt.hash(String(password), 10);
  const emailLower = String(email).toLowerCase().trim();
  const isTestAccount = emailLower.endsWith('@cardiosight.local') ||
                        emailLower.includes('testuser') ||
                        emailLower.includes('patient_alpha') ||
                        emailLower.includes('patient_beta') ||
                        emailLower.includes('sysval');

  const { rows } = await pool.query(
    `INSERT INTO users
       (first_name, last_name, email, password_hash, phone, gender, avatar_color, is_test, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
     RETURNING *`,
    [
      String(firstName).trim(),
      String(lastName).trim(),
      emailLower,
      passwordHash,
      phone ? String(phone).trim() : '',
      gender || 'other',
      '#43A047',
      isTestAccount,
    ]
  );
  const user = rows[0];

  // The patient profile is the account holder (frontend has no separate patient flow).
  await pool.query('INSERT INTO patients (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);

  // 6-digit email verification code (dev-only delivery via message; wire up email later).
  const code = generateCode();
  await storeCode(user.id, 'email_verify', code);

  res.status(201).json({
    success: true,
    message: `Account created. Verification code: ${code} (dev only – not emailed).`,
    data: { tokens: signTokens(user), user: serializeUser(user) },
  });
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !EMAIL_RE.test(String(email))) throw new HttpError(400, 'A valid email address is required.');
  if (!password) throw new HttpError(400, 'Password is required.');

  const user = await findUserByEmail(email);
  if (!user) throw new HttpError(401, 'Invalid email or password.');

  const valid = await bcrypt.compare(String(password), user.password_hash);
  if (!valid) throw new HttpError(401, 'Invalid email or password.');

  if (user.status === 'suspended') {
    throw new HttpError(403, 'Your account has been suspended by an administrator. Please contact support.');
  }

  res.json({
    success: true,
    message: 'Login successful.',
    data: { tokens: signTokens(user), user: serializeUser(user) },
  });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found.');
  res.json({ success: true, message: 'Profile retrieved.', data: serializeUser(rows[0]) });
});

/** POST /api/auth/forgot-password */
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email))) throw new HttpError(400, 'A valid email address is required.');

  const user = await findUserByEmail(email);

  // Always respond the same way to avoid leaking account existence.
  if (!user) {
    return res.json({
      success: true,
      message: 'If an account exists for this email, a reset code has been sent.',
      data: { message: 'If an account exists for this email, a reset code has been sent.' },
    });
  }

  // The Angular verify-email page reuses this endpoint to resend its code,
  // so serve an email-verify code while the account is unverified.
  const purpose = user.is_email_verified ? 'password_reset' : 'email_verify';
  const code = generateCode();
  await storeCode(user.id, purpose, code);

  const text =
    purpose === 'password_reset'
      ? 'A password reset code has been sent to your email.'
      : 'A new verification code has been sent to your email.';
  res.json({
    success: true,
    message: `${text} Code: ${code} (dev only – not emailed).`,
    data: { message: text },
  });
});

/** POST /api/auth/reset-password */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body || {};

  if (!token || !/^\d{6}$/.test(String(token))) throw new HttpError(400, 'A valid 6-digit code is required.');
  if (!password || String(password).length < 6) throw new HttpError(400, 'Password must be at least 6 characters.');

  const { rows } = await pool.query(
    `SELECT vc.user_id, u.email
       FROM verification_codes vc
       JOIN users u ON u.id = vc.user_id
      WHERE vc.purpose = 'password_reset' AND vc.code_hash = $1
        AND vc.used = FALSE AND vc.expires_at > now()
      ORDER BY vc.created_at DESC
      LIMIT 1`,
    [hashCode(String(token))]
  );
  if (rows.length === 0) throw new HttpError(400, 'Invalid or expired code.');

  const passwordHash = await bcrypt.hash(String(password), 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, rows[0].user_id]);
  await pool.query(
    "UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND purpose = 'password_reset'",
    [rows[0].user_id]
  );

  res.json({ success: true, message: 'Password has been reset successfully.', data: { message: 'Password has been reset successfully.' } });
});

/** POST /api/auth/verify-email */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.body || {};

  if (!token || !/^\d{6}$/.test(String(token))) throw new HttpError(400, 'A valid 6-digit code is required.');

  const { rows } = await pool.query(
    `SELECT vc.user_id
       FROM verification_codes vc
      WHERE vc.purpose = 'email_verify' AND vc.code_hash = $1
        AND vc.used = FALSE AND vc.expires_at > now()
      ORDER BY vc.created_at DESC
      LIMIT 1`,
    [hashCode(String(token))]
  );
  if (rows.length === 0) throw new HttpError(400, 'Invalid or expired verification code.');

  await pool.query('UPDATE users SET is_email_verified = TRUE WHERE id = $1', [rows[0].user_id]);
  await pool.query(
    "UPDATE verification_codes SET used = TRUE WHERE user_id = $1 AND purpose = 'email_verify'",
    [rows[0].user_id]
  );

  res.json({ success: true, message: 'Email verified successfully.', data: { message: 'Email verified successfully.' } });
});

module.exports = {
  register,
  login,
  me,
  forgotPassword,
  resetPassword,
  verifyEmail,
  serializeUser,
  consumeCode,
  storeCode,
  generateCode,
};
