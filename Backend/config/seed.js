// =============================================================================
// Seeds an initial admin account. Run via: npm run db:seed
// Safe & Idempotent: Never overwrites existing passwords or uses default credentials in production.
// =============================================================================
require('dotenv').config();
const bcrypt = require('bcrypt');
const pool = require('./db');

const isProduction = process.env.NODE_ENV === 'production';

async function main() {
  try {
    let email = process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL.toLowerCase().trim() : null;
    let password = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;

    if (isProduction) {
      if (!email || !password) {
        console.warn('[Seed] ADMIN_EMAIL or ADMIN_PASSWORD not configured in production. Skipping admin seed.');
        return;
      }
    } else {
      email = email || 'admin@cardiosight.local';
      password = password || 'Admin@12345';
    }

    // Check if admin already exists — never overwrite existing passwords or promote non-admin accounts!
    const { rows: existing } = await pool.query(
      'SELECT id, email, role FROM users WHERE lower(email) = $1',
      [email]
    );

    if (existing.length === 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(
          `INSERT INTO users (first_name, last_name, email, password_hash, role, is_email_verified, avatar_color)
           VALUES ('Cardio', 'Admin', $1, $2, 'admin', TRUE, '#1565C0')
           RETURNING id, email, role`,
          [email, await bcrypt.hash(password, 10)]
        );
        await client.query(
          'INSERT INTO patients (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
          [rows[0].id]
        );
        await client.query('COMMIT');
        console.log('[Seed] Admin account created successfully.');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else if (existing[0].role === 'admin') {
      console.log(`[Seed] Admin account ${email} already exists (skipped). Existing user preserved.`);
    } else {
      const err = new Error(
        `[Seed] Account "${email}" already exists with non-admin role "${existing[0].role}". Cannot provision admin access.`
      );
      console.error(err.message);
      throw err;
    }

    // Demo patient account in development only (never in production)
    if (!isProduction) {
      const demoEmail = (process.env.DEMO_PATIENT_EMAIL || 'aarav.sharma@demo.com').toLowerCase().trim();
      const demoPassword = process.env.DEMO_PATIENT_PASSWORD || 'Password@123';
      const { rows: existingDemo } = await pool.query(
        'SELECT id FROM users WHERE lower(email) = $1',
        [demoEmail]
      );
      if (existingDemo.length === 0) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows: demoRows } = await client.query(
            `INSERT INTO users (first_name, last_name, email, password_hash, phone, role, is_email_verified, avatar_color, gender, date_of_birth, height_cm, weight_kg, blood_group)
             VALUES ('Aarav', 'Sharma', $1, $2, '+91 98765 43210', 'patient', TRUE, '#43A047', 'male', '1985-06-15', 176, 74, 'B+')
             RETURNING id`,
            [demoEmail, await bcrypt.hash(demoPassword, 10)]
          );
          if (demoRows.length > 0) {
            await client.query(
              'INSERT INTO patients (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING',
              [demoRows[0].id]
            );
          }
          await client.query('COMMIT');
          console.log(`[Seed] Demo patient ready: ${demoEmail}`);
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
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
  console.error('Failed to seed database:', err.message);
  process.exit(1);
});
