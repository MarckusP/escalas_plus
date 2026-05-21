import path from 'path';
import fs from 'fs';
import { pool } from '../database';

type ConnStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

let sock: any = null;
let lastQr: string | null = null;
let status: ConnStatus = 'disconnected';
let initStarted = false;

const AUTH_DIR =
  process.env.WHATSAPP_AUTH_DIR ||
  path.join(process.cwd(), 'data', 'whatsapp-auth');

async function setDbStatus(s: ConnStatus, phone?: string | null) {
  status = s;
  await pool.query(
    `
    UPDATE whatsapp_connection
    SET status = $1::varchar,
        phone_number = COALESCE($2::varchar, phone_number),
        connected_at = CASE WHEN $1::varchar = 'connected' THEN NOW() ELSE connected_at END,
        last_qr_at = CASE WHEN $1::varchar = 'qr' THEN NOW() ELSE last_qr_at END,
        updated_at = NOW()
    WHERE id = 1
    `,
    [s, phone ?? null]
  );
}

export function getLocalStatus() {
  return { status, qr: lastQr };
}

export async function getStatusFromDb() {
  const { rows } = await pool.query(
    'SELECT status, phone_number, connected_at, last_qr_at FROM whatsapp_connection WHERE id = 1'
  );
  const r = rows[0] || {};
  return {
    status: r.status || status,
    phone_number: r.phone_number,
    connected_at: r.connected_at,
    last_qr_at: r.last_qr_at,
    qr: lastQr,
    live: status,
  };
}

export async function initWhatsApp() {
  if (initStarted) return;
  initStarted = true;
  try {
    const baileys = await import('@whiskeysockets/baileys');
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } =
      baileys;

    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const pino = (await import('pino')).default;

    const start = async () => {
      await setDbStatus('connecting');
      sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        browser: ['Escalas Plus', 'Chrome', '1.0.0'],
      });

      sock.ev.on('creds.update', saveCreds);

      sock.ev.on('connection.update', async (update: any) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
          lastQr = qr;
          await setDbStatus('qr');
        }
        if (connection === 'open') {
          lastQr = null;
          const me = sock?.user?.id?.split(':')[0] || null;
          await setDbStatus('connected', me);
          await syncGroupsToDb();
        }
        if (connection === 'close') {
          const code = (lastDisconnect?.error as any)?.output?.statusCode;
          const shouldReconnect = code !== DisconnectReason.loggedOut;
          await setDbStatus('disconnected');
          sock = null;
          if (shouldReconnect) setTimeout(() => start(), 3000);
        }
      });
    };

    await start();
    setInterval(() => processOutbox().catch(() => {}), 8000);
  } catch (err) {
    console.error('WhatsApp Baileys não iniciado:', err);
    await setDbStatus('disconnected');
  }
}

export async function logoutWhatsApp() {
  if (sock) {
    try {
      await sock.logout();
    } catch {
      /* ignore */
    }
    sock = null;
  }
  if (fs.existsSync(AUTH_DIR)) {
    fs.rmSync(AUTH_DIR, { recursive: true, force: true });
  }
  lastQr = null;
  await setDbStatus('disconnected', null);
  initStarted = false;
  await initWhatsApp();
}

export async function syncGroupsToDb() {
  if (!sock || status !== 'connected') return [];
  const groups = await sock.groupFetchAllParticipating();
  const entries = Object.values(groups || {}) as any[];
  for (const g of entries) {
    const jid = g.id;
    const name = g.subject || jid;
    await pool.query(
      `
      INSERT INTO whatsapp_groups (jid, name, synced_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (jid) DO UPDATE SET name = EXCLUDED.name, synced_at = NOW()
      `,
      [jid, name]
    );
  }
  const { rows } = await pool.query(
    'SELECT jid, name, notify_general, synced_at FROM whatsapp_groups ORDER BY name'
  );
  return rows;
}

export async function listGroups() {
  const { rows } = await pool.query(
    'SELECT jid, name, notify_general, synced_at FROM whatsapp_groups ORDER BY name'
  );
  return rows;
}

export async function setGroupNotify(jid: string, notify: boolean) {
  await pool.query('UPDATE whatsapp_groups SET notify_general = $2 WHERE jid = $1', [
    jid,
    notify,
  ]);
}

export async function sendText(jid: string, text: string): Promise<boolean> {
  if (!sock || status !== 'connected') return false;
  try {
    await sock.sendMessage(jid, { text });
    return true;
  } catch (e) {
    console.error('WhatsApp send error:', e);
    return false;
  }
}

export async function processOutbox() {
  if (!sock || status !== 'connected') return;
  const { rows } = await pool.query(
    `SELECT id, target_jid, body FROM whatsapp_outbox WHERE status = 'pending' ORDER BY id LIMIT 10`
  );
  for (const row of rows) {
    const ok = await sendText(row.target_jid, row.body);
    await pool.query(
      `UPDATE whatsapp_outbox SET status = $2, sent_at = CASE WHEN $2 = 'sent' THEN NOW() ELSE sent_at END,
       error_message = $3 WHERE id = $1`,
      [row.id, ok ? 'sent' : 'failed', ok ? null : 'Falha ao enviar']
    );
  }
}
