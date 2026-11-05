// =============================================================================
// User management controller – profile read/update and password change.
// =============================================================================
const bcrypt = require('bcrypt');
const pool = require('../config/db');
const { asyncHandler, HttpError } = require('../middleware/errorHandler');
const { serializeUser } = require('./authController');

const GENDERS = ['male', 'female', 'other'];

/** GET /api/profile */
const getProfile = asyncHandler(async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found.');
  res.json({ success: true, message: 'Profile retrieved.', data: serializeUser(rows[0]) });
});

/** PUT /api/profile */
const updateProfile = asyncHandler(async (req, res) => {
  const body = req.body || {};

  // Prevent role elevation / modification
  if (body.role !== undefined) {
    const incomingRole = String(body.role).toLowerCase().trim();
    const currentRole = String(req.user.role || '').toLowerCase().trim();
    if (incomingRole !== currentRole) {
      throw new HttpError(403, 'Forbidden: Modifying account role is not permitted.');
    }
  }

  const fields = {
    firstName: 'first_name',
    lastName: 'last_name',
    phone: 'phone',
    avatarColor: 'avatar_color',
    gender: 'gender',
    dateOfBirth: 'date_of_birth',
    heightCm: 'height_cm',
    weightKg: 'weight_kg',
    bloodGroup: 'blood_group',
    allergies: 'allergies',
    medications: 'medications',
    medicalConditions: 'medical_conditions',
  };

  const assignments = [];
  const values = [];
  let index = 1;

  for (const [key, column] of Object.entries(fields)) {
    if (body[key] === undefined) continue;

    if (key === 'firstName' && !String(body[key]).trim()) throw new HttpError(400, 'First name cannot be empty.');
    if (key === 'lastName' && !String(body[key]).trim()) throw new HttpError(400, 'Last name cannot be empty.');
    if (key === 'gender' && body[key] && !GENDERS.includes(body[key])) throw new HttpError(400, 'Invalid gender value.');
    if (['heightCm', 'weightKg'].includes(key) && body[key] !== null && Number(body[key]) < 0) {
      throw new HttpError(400, `${key} cannot be negative.`);
    }

    let value = body[key];
    if (['heightCm', 'weightKg'].includes(key)) {
      value = (value === '' || value === null || Number(value) <= 0) ? null : Number(value);
    }
    if (['allergies', 'medications', 'medicalConditions'].includes(key)) {
      if (!Array.isArray(value)) throw new HttpError(400, `${key} must be an array.`);
      value = JSON.stringify(value);
    }
    if (key === 'dateOfBirth') {
      if (value && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        throw new HttpError(400, 'Date of birth must be YYYY-MM-DD.');
      }
      value = value ? String(value).slice(0, 10) : null;
    }

    assignments.push(`${column} = $${index}`);
    values.push(value === '' ? null : value);
    index += 1;
  }

  if (assignments.length === 0) throw new HttpError(400, 'No profile fields provided to update.');

  values.push(req.user.id);
  const { rows } = await pool.query(
    `UPDATE users SET ${assignments.join(', ')} WHERE id = $${index} RETURNING *`,
    values
  );
  if (rows.length === 0) throw new HttpError(404, 'User not found.');

  res.json({ success: true, message: 'Profile updated.', data: serializeUser(rows[0]) });
});

/** PUT /api/profile/password */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};

  if (!currentPassword) throw new HttpError(400, 'Current password is required.');
  if (!newPassword || String(newPassword).length < 6) throw new HttpError(400, 'New password must be at least 6 characters.');

  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
  if (rows.length === 0) throw new HttpError(404, 'User not found.');

  const valid = await bcrypt.compare(String(currentPassword), rows[0].password_hash);
  if (!valid) throw new HttpError(400, 'Current password is incorrect.');

  const passwordHash = await bcrypt.hash(String(newPassword), 10);
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, req.user.id]);

  res.json({ success: true, message: 'Password changed successfully.', data: { message: 'Password changed successfully.' } });
});

module.exports = { getProfile, updateProfile, changePassword };
