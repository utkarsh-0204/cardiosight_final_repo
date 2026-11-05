// =============================================================================
// Applies config/schema.sql to the database and provisions initial accounts.
// Safe & Idempotent: Never drops tables, overwrites existing users, or exposes passwords.
// Ensures user and patient-profile records are provisioned atomically in transactions.
// =============================================================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const pool = require('./db');

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Executes user insertion and associated patient profile creation within an atomic transaction.
 */
async function insertUserAndPatient(client, userSql, userParams) {
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(userSql, userParams);
    if (rows.length > 0) {
      await client.query(
        'INSERT INTO patients (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
        [rows[0].id]
      );
    }
    await client.query('COMMIT');
    return rows[0] || null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  try {
    // 1. Apply idempotent schema
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('[Database] Schema applied successfully.');

    // 2. Provision Admin
    let adminEmail = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.toLowerCase().trim() : null;
    let adminPassword = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;

    if (isProduction) {
      // In production: Strictly require configured environment variables. No default password fallback.
      if (!adminEmail || !adminPassword) {
        console.warn('[Admin Provisioning] ADMIN_EMAIL or ADMIN_PASSWORD not configured in production environment variables.');
        console.warn('[Admin Provisioning] Skipping admin account creation (no default credentials permitted).');
      } else {
        const { rows: existingUsers } = await pool.query(
          'SELECT id, email, role FROM users WHERE lower(email) = $1',
          [adminEmail]
        );

        if (existingUsers.length === 0) {
          const passwordHash = await bcrypt.hash(adminPassword, 10);
          const client = await pool.connect();
          try {
            await insertUserAndPatient(
              client,
              `INSERT INTO users (first_name, last_name, email, password_hash, role, is_email_verified, avatar_color)
               VALUES ('Cardio', 'Admin', $1, $2, 'admin', TRUE, '#1565C0')
               RETURNING id, email, role`,
              [adminEmail, passwordHash]
            );
            console.log('[Admin Provisioning] Production admin account provisioned successfully.');
          } finally {
            client.release();
          }
        } else if (existingUsers[0].role === 'admin') {
          console.log('[Admin Provisioning] Admin account already exists (skipped). Existing user and password preserved.');
        } else {
          const err = new Error(
            `[Admin Provisioning] Account "${adminEmail}" already exists with non-admin role "${existingUsers[0].role}". Cannot provision admin access.`
          );
          console.error(err.message);
          throw err;
        }
      }
    } else {
      // In local development: Allow dev fallbacks so local test suites and developer environments work seamlessly.
      adminEmail = adminEmail || 'admin@cardiosight.local';
      adminPassword = adminPassword || 'Admin@12345';

      const { rows: existingUsers } = await pool.query(
        'SELECT id, email, role FROM users WHERE lower(email) = $1',
        [adminEmail]
      );

      if (existingUsers.length === 0) {
        const passwordHash = await bcrypt.hash(adminPassword, 10);
        const client = await pool.connect();
        try {
          await insertUserAndPatient(
            client,
            `INSERT INTO users (first_name, last_name, email, password_hash, role, is_email_verified, avatar_color)
             VALUES ('Cardio', 'Admin', $1, $2, 'admin', TRUE, '#1565C0')
             RETURNING id, email, role`,
            [adminEmail, passwordHash]
          );
          console.log(`[Admin Provisioning] Dev admin account created: ${adminEmail}`);
        } finally {
          client.release();
        }
      } else if (existingUsers[0].role === 'admin') {
        console.log(`[Admin Provisioning] Dev admin account already exists: ${adminEmail} (skipped).`);
      } else {
        const err = new Error(
          `[Admin Provisioning] Account "${adminEmail}" already exists with non-admin role "${existingUsers[0].role}". Cannot provision admin access.`
        );
        console.error(err.message);
        throw err;
      }

      // Provision Demo Patient in development only (never in production)
      const demoEmail = (process.env.DEMO_PATIENT_EMAIL || 'aarav.sharma@demo.com').toLowerCase().trim();
      const demoPassword = process.env.DEMO_PATIENT_PASSWORD || 'Password@123';

      const { rows: existingDemo } = await pool.query(
        'SELECT id FROM users WHERE lower(email) = $1',
        [demoEmail]
      );

      if (existingDemo.length === 0) {
        const demoHash = await bcrypt.hash(demoPassword, 10);
        const client = await pool.connect();
        try {
          await insertUserAndPatient(
            client,
            `INSERT INTO users (first_name, last_name, email, password_hash, phone, role, is_email_verified, avatar_color, gender, date_of_birth, height_cm, weight_kg, blood_group)
             VALUES ('Aarav', 'Sharma', $1, $2, '+91 98765 43210', 'patient', TRUE, '#43A047', 'male', '1985-06-15', 176, 74, 'B+')
             RETURNING id`,
            [demoEmail, demoHash]
          );
          console.log(`[Demo Provisioning] Dev demo patient account created: ${demoEmail}`);
        } finally {
          client.release();
        }
      }
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Failed to initialize database:', err.message);
  process.exit(1);
});
