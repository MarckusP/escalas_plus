import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { pool } from '../database';
import { publicUserFromRow } from './authService';
import { assertPassword } from '../utils/passwordPolicy';
import { toE164, isEmailIdentifier } from '../utils/phone';
import * as verificationService from './verificationService';
import * as waMsg from './whatsappMessageService';

const JWT_EXPIRES = '5d';

function signToken(volunteerId: number) {
  return jwt.sign({ id: volunteerId }, process.env.JWT_SECRET || 'secret', {
    expiresIn: JWT_EXPIRES,
  });
}

export function verifyMagicToken(token: string): { id: number; redirect?: string } | null {
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'secret') as {
      id: number;
      magic?: boolean;
      redirect?: string;
    };
    if (!payload?.id) return null;
    return { id: payload.id, redirect: payload.redirect };
  } catch {
    return null;
  }
}

export async function magicLogin(token: string) {
  const data = verifyMagicToken(token);
  if (!data) throw new Error('Link inválido ou expirado');
  const { rows } = await pool.query('SELECT * FROM volunteers WHERE id = $1 AND active = true', [
    data.id,
  ]);
  if (!rows[0]) throw new Error('Usuário não encontrado');
  if (rows[0].status === 'pending') throw new Error('Cadastro pendente de aprovação');
  return { token: signToken(rows[0].id), user: publicUserFromRow(rows[0]), redirect: data.redirect };
}

async function findUserByIdentifier(identifier: string) {
  const id = identifier.trim();
  if (isEmailIdentifier(id)) {
    const { rows } = await pool.query(
      'SELECT * FROM volunteers WHERE LOWER(email) = LOWER($1) AND active = true',
      [id]
    );
    return rows[0];
  }
  const digits = id.replace(/\D/g, '');
  const { rows } = await pool.query(
    `SELECT * FROM volunteers WHERE active = true
     AND (phone_e164 = $1 OR CONCAT('55', phone_ddd, phone_number) = $1)`,
    [digits]
  );
  return rows[0];
}

export async function loginStart(identifier: string, password: string) {
  const user = await findUserByIdentifier(identifier);
  if (!user) throw new Error('Usuário não encontrado');
  if (user.status === 'pending') throw new Error('Seu cadastro está pendente de aprovação');
  if (user.status === 'rejected') throw new Error('Seu cadastro foi recusado');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new Error('Senha incorreta');

  const channel = (user.login_otp_channel || 'email') as 'email' | 'whatsapp';
  const { code, phone_e164 } = await verificationService.createVerificationCode({
    purpose: 'login',
    channel,
    email: user.email,
    phone_ddd: user.phone_ddd,
    phone_number: user.phone_number,
  });

  if (channel === 'whatsapp' && phone_e164) {
    await waMsg.sendRawCode(phone_e164, code, 'Login Escalas Plus');
  } else {
    console.log(`[DEV] Código login e-mail ${user.email}: ${code}`);
  }

  const sessionId = verificationService.newLoginSessionId();
  const expires = new Date(Date.now() + 15 * 60 * 1000);
  await pool.query(
    `INSERT INTO auth_login_sessions (id, volunteer_id, otp_channel, expires_at) VALUES ($1,$2,$3,$4)`,
    [sessionId, user.id, channel, expires]
  );

  return {
    requires2fa: true,
    sessionId,
    channel,
    maskedEmail: user.email?.replace(/(.{2}).+(@.+)/, '$1***$2'),
    maskedPhone: phone_e164 ? `***${phone_e164.slice(-4)}` : null,
  };
}

export async function loginVerify(sessionId: string, code: string) {
  const { rows: sessions } = await pool.query(
    `SELECT * FROM auth_login_sessions WHERE id = $1 AND verified = false AND expires_at > NOW()`,
    [sessionId]
  );
  const session = sessions[0];
  if (!session) throw new Error('Sessão expirada. Faça login novamente.');

  const { rows } = await pool.query('SELECT * FROM volunteers WHERE id = $1', [
    session.volunteer_id,
  ]);
  const user = rows[0];
  if (!user) throw new Error('Usuário não encontrado');

  const phone_e164 = user.phone_e164 || toE164(user.phone_ddd, user.phone_number);
  const verified = await verificationService.verifyCode({
    purpose: 'login',
    code,
    email: user.email,
    phone_e164,
  });
  if (!verified.ok) throw new Error('Código inválido ou expirado');

  await pool.query('UPDATE auth_login_sessions SET verified = true WHERE id = $1', [sessionId]);

  return { token: signToken(user.id), user: publicUserFromRow(user) };
}

export async function sendRegisterCode(opts: {
  channel: 'email' | 'whatsapp';
  email: string;
  phone_ddd: string;
  phone_number: string;
}) {
  const phone_e164 = toE164(opts.phone_ddd, opts.phone_number);
  if (!phone_e164) throw new Error('Telefone inválido');

  const { code } = await verificationService.createVerificationCode({
    purpose: 'register',
    channel: opts.channel,
    email: opts.email,
    phone_ddd: opts.phone_ddd,
    phone_number: opts.phone_number,
    payload: { email: opts.email, phone_e164 },
  });

  if (opts.channel === 'whatsapp') {
    await waMsg.sendRawCode(phone_e164, code, 'Validação de cadastro');
  } else {
    console.log(`[DEV] Código cadastro e-mail ${opts.email}: ${code}`);
  }

  return { ok: true, phone_e164 };
}

export async function verifyRegisterCode(opts: {
  channel: 'email' | 'whatsapp';
  email: string;
  phone_ddd: string;
  phone_number: string;
  code: string;
}) {
  const phone_e164 = toE164(opts.phone_ddd, opts.phone_number);
  const result = await verificationService.verifyCode({
    purpose: 'register',
    code: opts.code,
    email: opts.email,
    phone_e164,
  });
  if (!result.ok) throw new Error('Código inválido ou expirado');
  const verifyToken = jwt.sign(
    { email: opts.email, phone_e164, verified: true },
    process.env.JWT_SECRET || 'secret',
    { expiresIn: '1h' }
  );
  return { verifyToken, phone_e164 };
}

export async function registerWithVerifyToken(
  verifyToken: string,
  data: {
    name: string;
    email: string;
    password: string;
    phone_ddd: string;
    phone_number: string;
    church_id: number;
    login_otp_channel?: 'email' | 'whatsapp';
  }
) {
  let payload: { email?: string; phone_e164?: string; verified?: boolean };
  try {
    payload = jwt.verify(verifyToken, process.env.JWT_SECRET || 'secret') as typeof payload;
  } catch {
    throw new Error('Validação de telefone/e-mail expirada. Refaça a verificação.');
  }
  if (!payload.verified) throw new Error('Telefone/e-mail não verificado');

  assertPassword(data.password);
  const phone_e164 = payload.phone_e164 || toE164(data.phone_ddd, data.phone_number);
  const hash = await bcrypt.hash(data.password, 10);
  const channel = data.login_otp_channel || 'whatsapp';

  const { rows } = await pool.query(
    `
    INSERT INTO volunteers (
      name, email, password_hash, role, church_id, phone_ddd, phone_number,
      phone_e164, phone_verified, login_otp_channel, status
    ) VALUES ($1,$2,$3,'voluntario',$4,$5,$6,$7,true,$8,'pending')
    RETURNING *
    `,
    [
      data.name,
      data.email,
      hash,
      data.church_id,
      data.phone_ddd,
      data.phone_number,
      phone_e164,
      channel,
    ]
  );
  return rows[0];
}

export async function loginWithGoogle(idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('Login Google não configurado (GOOGLE_CLIENT_ID)');

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.email) throw new Error('Token Google inválido');

  const googleId = payload.sub!;
  const email = payload.email.toLowerCase();

  let { rows } = await pool.query('SELECT * FROM volunteers WHERE google_id = $1', [googleId]);
  if (!rows[0]) {
    const byEmail = await pool.query('SELECT * FROM volunteers WHERE LOWER(email) = $1', [email]);
    if (byEmail.rows[0]) {
      await pool.query(
        'UPDATE volunteers SET google_id = $1, google_email = $2 WHERE id = $3',
        [googleId, email, byEmail.rows[0].id]
      );
      rows = byEmail.rows;
    }
  }

  if (!rows[0]) {
    throw new Error('Nenhuma conta vinculada a este Gmail. Cadastre-se ou peça ao administrador.');
  }

  const user = rows[0];
  if (user.status === 'pending') throw new Error('Cadastro pendente de aprovação');
  if (!user.active) throw new Error('Conta inativa');

  return { token: signToken(user.id), user: publicUserFromRow(user) };
}

export async function linkGoogle(volunteerId: number, idToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID não configurado');
  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new Error('Token inválido');
  await pool.query('UPDATE volunteers SET google_id = $1, google_email = $2 WHERE id = $3', [
    payload.sub,
    payload.email,
    volunteerId,
  ]);
}
