-- =============================================================================
-- CardioSight PostgreSQL schema.
-- Idempotent: safe to run multiple times.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name          VARCHAR(100) NOT NULL,
  last_name           VARCHAR(100) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       TEXT NOT NULL,
  phone               VARCHAR(50)  NOT NULL DEFAULT '',
  role                VARCHAR(20)  NOT NULL DEFAULT 'patient'
                      CHECK (role IN ('patient', 'admin')),
  avatar_color        VARCHAR(20)  NOT NULL DEFAULT '#43A047',
  gender              VARCHAR(10)  NOT NULL DEFAULT 'other'
                      CHECK (gender IN ('male', 'female', 'other')),
  date_of_birth       DATE,
  height_cm           NUMERIC(5,1),
  weight_kg           NUMERIC(5,1),
  blood_group         VARCHAR(5),
  allergies           JSONB        NOT NULL DEFAULT '[]',
  medications         JSONB        NOT NULL DEFAULT '[]',
  medical_conditions  JSONB        NOT NULL DEFAULT '[]',
  is_email_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- patients – one row per user (the patient IS the account holder).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS predictions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  patient_id           UUID REFERENCES patients(id) ON DELETE SET NULL,
  prediction           VARCHAR(50),
  risk_level           VARCHAR(10) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  risk_score           NUMERIC(5,1),
  confidence           NUMERIC(5,1),
  probability          NUMERIC(5,1),
  status               VARCHAR(20) NOT NULL DEFAULT 'completed'
                       CHECK (status IN ('completed', 'processing', 'failed')),
  input                JSONB NOT NULL DEFAULT '{}',
  recommendations      JSONB NOT NULL DEFAULT '[]',
  contributing_factors JSONB NOT NULL DEFAULT '[]',
  explanation          JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE predictions ADD COLUMN IF NOT EXISTS explanation JSONB;

CREATE INDEX IF NOT EXISTS idx_predictions_user_id     ON predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created_at  ON predictions(created_at DESC);

-- ---------------------------------------------------------------------------
-- verification_codes – 6-digit email verification & password reset codes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS verification_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose     VARCHAR(20) NOT NULL CHECK (purpose IN ('email_verify', 'password_reset')),
  code_hash   TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user ON verification_codes(user_id);
