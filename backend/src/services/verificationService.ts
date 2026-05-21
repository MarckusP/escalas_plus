import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { pool } from '../database';
import { toE164 } from '../utils/phone';

const CODE_TTL_MIN = 15;

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function createVerificationCode(opts: {
  purpose: string;
  channel: 'email' | 'whatsapp';
  email?: string;
  phone_ddd?: string;
  phone_number?: string;
  payload?: Record<string, unknown>;
}): Promise<{ code: string; phone_e164: string | null }> {
  const code = generateCode();
  const hash = await bcrypt.hash(code, 8);
  const phone_e164 =
    opts.phone_ddd && opts.phone_number
      ? toE164(opts.phone_ddd, opts.phone_number)
      : null;
  const expires = new Date(Date.now() + CODE_TTL_MIN * 60 * 1000);

  await pool.query(
    `
    INSERT INTO verification_codes (purpose, channel, email, phone_e164, code_hash, payload, expires_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7)
    `,
    [
      opts.purpose,
      opts.channel,
      opts.email?.trim().toLowerCase() || null,
      phone_e164,
      hash,
      opts.payload ? JSON.stringify(opts.payload) : null,
      expires,
    ]
  );

  return { code, phone_e164 };
}

export async function verifyCode(opts: {
  purpose: string;
  code: string;
  email?: string;
  phone_e164?: string | null;
}): Promise<{ ok: boolean; payload?: Record<string, unknown> }> {
  const { rows } = await pool.query(
    `
    SELECT id, code_hash, payload, expires_at, used_at
    FROM verification_codes
    WHERE purpose = $1
      AND used_at IS NULL
      AND expires_at > NOW()
      AND (
        ($2::varchar IS NOT NULL AND email = $2)
        OR ($3::varchar IS NOT NULL AND phone_e164 = $3)
      )
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [opts.purpose, opts.email?.trim().toLowerCase() || null, opts.phone_e164 || null]
  );
  const row = rows[0];
  if (!row) return { ok: false };
  const valid = await bcrypt.compare(opts.code, row.code_hash);
  if (!valid) return { ok: false };
  await pool.query('UPDATE verification_codes SET used_at = NOW() WHERE id = $1', [row.id]);
  return { ok: true, payload: row.payload || undefined };
}

export function newLoginSessionId(): string {
  return crypto.randomUUID();
}
