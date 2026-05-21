import jwt from 'jsonwebtoken';
import { pool } from '../database';
import { e164ToWhatsAppJid } from '../utils/phone';
import { magicLoginUrl } from '../utils/appLinks';
import * as whatsapp from './whatsappBaileysService';

const HEADER = '*Notificações Bot Escalas Plus*';

export type WaNotifyKind = 'geral' | 'individual';

export function formatWhatsAppBody(title: string, body: string, link?: string): string {
  const parts = [HEADER, '', title, body];
  if (link) parts.push('', `🔗 ${link}`);
  return parts.join('\n');
}

export function createAccessToken(volunteerId: number, redirectPath: string): string {
  const secret = process.env.JWT_SECRET || 'secret';
  const token = jwt.sign(
    { id: volunteerId, magic: true, redirect: redirectPath },
    secret,
    { expiresIn: '5d' }
  );
  return magicLoginUrl(token, redirectPath);
}

export async function queueIndividual(
  volunteerId: number,
  title: string,
  body: string,
  linkPath: string,
  referenceType?: string,
  referenceId?: number
) {
  const { rows } = await pool.query(
    `SELECT phone_e164, phone_verified, active, status FROM volunteers WHERE id = $1`,
    [volunteerId]
  );
  const v = rows[0];
  if (!v?.phone_e164 || !v.phone_verified || !v.active || v.status !== 'active') return;

  const link = createAccessToken(volunteerId, linkPath);
  const text = formatWhatsAppBody(title, body, link);
  const jid = e164ToWhatsAppJid(v.phone_e164);

  await pool.query(
    `
    INSERT INTO whatsapp_outbox (target_type, target_jid, body, reference_type, reference_id)
    VALUES ('individual', $1, $2, $3, $4)
    `,
    [jid, text, referenceType || null, referenceId ?? null]
  );
  void whatsapp.processOutbox();
}

export async function queueGeneral(
  title: string,
  body: string,
  linkPath: string,
  referenceType?: string,
  referenceId?: number
) {
  const link = `${process.env.FRONTEND_URL || 'http://localhost:3000'}${linkPath.startsWith('/') ? linkPath : `/${linkPath}`}`;
  const text = formatWhatsAppBody(title, body, link);

  const { rows: groups } = await pool.query(
    `SELECT jid FROM whatsapp_groups WHERE notify_general = true`
  );
  for (const g of groups) {
    await pool.query(
      `
      INSERT INTO whatsapp_outbox (target_type, target_jid, body, reference_type, reference_id)
      VALUES ('group', $1, $2, $3, $4)
      `,
      [g.jid, text, referenceType || null, referenceId ?? null]
    );
  }
  void whatsapp.processOutbox();
}

export async function sendRawCode(phoneE164: string, code: string, context: string) {
  const text = formatWhatsAppBody(
    context,
    `Seu código de verificação: *${code}*\nVálido por 15 minutos.`
  );
  const jid = e164ToWhatsAppJid(phoneE164);
  await whatsapp.sendText(jid, text);
}
