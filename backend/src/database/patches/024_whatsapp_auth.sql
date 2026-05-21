-- WhatsApp (Baileys) + autenticação estendida
ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS phone_e164 VARCHAR(20),
  ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS login_otp_channel VARCHAR(20) DEFAULT 'email'
    CHECK (login_otp_channel IN ('email', 'whatsapp')),
  ADD COLUMN IF NOT EXISTS google_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_volunteers_google_id
  ON volunteers (google_id) WHERE google_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS whatsapp_connection (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status VARCHAR(30) NOT NULL DEFAULT 'disconnected',
  phone_number VARCHAR(30),
  last_qr_at TIMESTAMP,
  connected_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO whatsapp_connection (id, status) VALUES (1, 'disconnected')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS whatsapp_groups (
  jid VARCHAR(80) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  notify_general BOOLEAN NOT NULL DEFAULT false,
  synced_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  purpose VARCHAR(30) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  email VARCHAR(255),
  phone_e164 VARCHAR(20),
  code_hash VARCHAR(128) NOT NULL,
  payload JSONB,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup
  ON verification_codes (purpose, email, phone_e164, expires_at);

CREATE TABLE IF NOT EXISTS auth_login_sessions (
  id UUID PRIMARY KEY,
  volunteer_id INT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  otp_channel VARCHAR(20) NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whatsapp_outbox (
  id SERIAL PRIMARY KEY,
  target_type VARCHAR(20) NOT NULL,
  target_jid VARCHAR(80) NOT NULL,
  body TEXT NOT NULL,
  reference_type VARCHAR(30),
  reference_id INT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_pending
  ON whatsapp_outbox (status, created_at) WHERE status = 'pending';

UPDATE volunteers
SET phone_e164 = '55' || phone_ddd || regexp_replace(COALESCE(phone_number, ''), '\D', '', 'g'),
    phone_verified = true
WHERE phone_ddd IS NOT NULL AND phone_number IS NOT NULL AND phone_e164 IS NULL;
