import { randomUUID } from 'crypto';
import { pool } from '../database';

function normalizeScheduleStatus(raw: unknown): string {
  const s = String(raw ?? 'pendente').toLowerCase().trim();
  if (s === 'confirmado' || s === 'recusado' || s === 'pendente') return s;
  return 'pendente';
}

/** Remove linhas só com recusado quando não há outra atribuição no mesmo evento (pendente/confirmado). */
export function filterScheduleRowsHideOrphanRecusado(rows: any[]): any[] {
  return rows.filter((s) => {
    if (normalizeScheduleStatus(s.status) !== 'recusado') return true;
    return rows.some(
      (o) =>
        Number(o.event_id) === Number(s.event_id) &&
        Number(o.id) !== Number(s.id) &&
        normalizeScheduleStatus(o.status) !== 'recusado'
    );
  });
}

export async function getScheduleByEvent(eventId: number) {
  const { rows } = await pool.query(`
    SELECT s.*, v.name as volunteer_name, r.name as role_name, d.name as department_name
    FROM schedule s
    LEFT JOIN volunteers v ON v.id = s.volunteer_id
    LEFT JOIN roles r ON r.id = s.role_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE s.event_id = $1
  `, [eventId]);
  return rows;
}

export async function addToSchedule(eventId: number, volunteerId: number, roleId: number) {
  const { rows } = await pool.query(
    'INSERT INTO schedule (event_id, volunteer_id, role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',
    [eventId, volunteerId, roleId]
  );
  return rows[0];
}

export async function removeFromSchedule(scheduleId: number) {
  await pool.query('DELETE FROM schedule WHERE id = $1', [scheduleId]);
}

export async function confirmSchedule(scheduleId: number) {
  const { rows } = await pool.query(
    'UPDATE schedule SET status = $1 WHERE id = $2 RETURNING *',
    ['confirmado', scheduleId]
  );
  return rows[0];
}

export async function updateScheduleStatus(
  scheduleId: number,
  status: 'confirmado' | 'recusado' | 'pendente'
) {
  const { rows } = await pool.query(
    'UPDATE schedule SET status = $1 WHERE id = $2 RETURNING *',
    [status, scheduleId]
  );
  return rows[0];
}

function periodFromEventTimeEv(eventTime: string | null | undefined): 'manha' | 'tarde' | 'noite' {
  if (!eventTime) return 'noite';
  const hour = Number(String(eventTime).slice(0, 2));
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

function eventRowDateStr(ev: { event_date: unknown }): string | null {
  const raw = ev.event_date;
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  const d = raw instanceof Date ? raw : new Date(raw as string);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Voluntários elegíveis para uma função no evento.
 * Permite a mesma pessoa em várias funções no mesmo evento — exclui só quem já ocupa esta função (role_id).
 */
export async function getAvailableVolunteers(
  eventId: number,
  departmentIds?: number[],
  roleId?: number
) {
  const event = await pool.query('SELECT * FROM events WHERE id = $1', [eventId]);
  if (!event.rows[0]) throw new Error('Evento não encontrado');
  const ev = event.rows[0];
  const churchId = ev.church_id;
  const eventDateStr = eventRowDateStr(ev);
  const period = periodFromEventTimeEv(ev.event_time);
  if (!eventDateStr) throw new Error('Data do evento inválida');

  const rid =
    roleId != null && Number.isFinite(Number(roleId)) && Number(roleId) > 0
      ? Number(roleId)
      : null;
  const occupiedRoleClause = rid != null ? 'AND s2.role_id = $5' : '';

  const baseQuery = `
    SELECT v.* FROM volunteers v
    WHERE v.active = true
      AND v.church_id = $2
      AND v.role <> 'super_admin'
      AND NOT EXISTS (
        SELECT 1 FROM schedule s2
        WHERE s2.volunteer_id = v.id AND s2.event_id = $1
        ${occupiedRoleClause}
      )
      AND NOT EXISTS (
        SELECT 1 FROM unavailability u
        WHERE u.volunteer_id = v.id
          AND u.exception_date = $3::date
          AND (u.period = $4 OR u.period = 'todos')
      )
  `;

  const baseParams: (number | string)[] = [eventId, churchId, eventDateStr, period];
  if (rid != null) baseParams.push(rid);

  if (departmentIds && departmentIds.length > 0) {
    const deptOffset = baseParams.length + 1;
    const placeholders = departmentIds.map((_, i) => `$${deptOffset + i}`).join(',');
    const query = `${baseQuery} AND EXISTS (SELECT 1 FROM volunteers_departments vd WHERE vd.volunteer_id = v.id AND vd.department_id IN (${placeholders}))`;
    const params = [...baseParams, ...departmentIds];
    const { rows } = await pool.query(query, params);
    return rows;
  }

  const { rows } = await pool.query(baseQuery, baseParams);
  return rows;
}

export type SameDayPendingItem = {
  kind: 'escala' | 'troca_alvo';
  schedule_id: number | null;
  swap_id: number | null;
  event_name: string;
  role_name: string | null;
  event_time: string | null;
  origin_label: string;
  detail: string | null;
};

/** Outras pendências do voluntário na mesma data (escala pendente ou troca aguardando aprovação do alvo). */
export async function getSameDayPendingConflicts(volunteerId: number, scheduleId: number) {
  const { rows: anchor } = await pool.query(
    `
    SELECT s.volunteer_id, e.event_date::text AS event_date
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = $1::integer
    `,
    [scheduleId]
  );
  const row = anchor[0];
  if (!row) throw new Error('Escala não encontrada');
  if (Number(row.volunteer_id) !== volunteerId) {
    throw new Error('Escala não pertence a este voluntário');
  }

  const eventDate = String(row.event_date || '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    throw new Error('Data do evento inválida');
  }

  const eventDaySubquery = `
    SELECT e0.event_date::date
    FROM schedule s0
    JOIN events e0 ON e0.id = s0.event_id
    WHERE s0.id = $2::integer
  `;

  const { rows: pendingSchedules } = await pool.query(
    `
    SELECT s.id AS schedule_id, e.name AS event_name, r.name AS role_name, e.event_time::text AS event_time
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN roles r ON r.id = s.role_id
    WHERE s.volunteer_id = $1::integer
      AND s.id <> $2::integer
      AND LOWER(TRIM(COALESCE(s.status, 'pendente'))) = 'pendente'
      AND e.event_date::date = (${eventDaySubquery})
    ORDER BY e.event_time NULLS LAST, r.name NULLS LAST
    `,
    [volunteerId, scheduleId]
  );

  const { rows: pendingSwaps } = await pool.query(
    `
    SELECT sr.id AS swap_id, sr.schedule_id, e.name AS event_name, r.name AS role_name,
           e.event_time::text AS event_time, req.name AS requester_name
    FROM swap_requests sr
    JOIN schedule s ON s.id = sr.schedule_id
    JOIN events e ON e.id = s.event_id
    LEFT JOIN roles r ON r.id = s.role_id
    JOIN volunteers req ON req.id = sr.requester_id
    WHERE sr.target_id = $1::integer
      AND sr.status = 'aguardando_aprovacao'
      AND sr.target_approved_by IS NULL
      AND e.event_date::date = (${eventDaySubquery})
    ORDER BY e.event_time NULLS LAST, r.name NULLS LAST
    `,
    [volunteerId, scheduleId]
  );

  const items: SameDayPendingItem[] = [];

  for (const ps of pendingSchedules) {
    items.push({
      kind: 'escala',
      schedule_id: Number(ps.schedule_id),
      swap_id: null,
      event_name: ps.event_name,
      role_name: ps.role_name ?? null,
      event_time: ps.event_time ?? null,
      origin_label: 'Escala — confirmação pendente',
      detail: null,
    });
  }

  const scheduleIdsWithSwap = new Set(
    pendingSwaps.map((sw: { schedule_id: number }) => Number(sw.schedule_id))
  );

  for (const sw of pendingSwaps) {
    const sid = Number(sw.schedule_id);
    if (sid === scheduleId) continue;
    if (scheduleIdsWithSwap.has(sid) && pendingSchedules.some((ps: { schedule_id: number }) => Number(ps.schedule_id) === sid)) {
      continue;
    }
    items.push({
      kind: 'troca_alvo',
      schedule_id: sid,
      swap_id: Number(sw.swap_id),
      event_name: sw.event_name,
      role_name: sw.role_name ?? null,
      event_time: sw.event_time ?? null,
      origin_label: 'Solicitação de troca — aguardando sua aprovação',
      detail: sw.requester_name ? `Solicitante: ${sw.requester_name}` : null,
    });
  }

  return { event_date: eventDate, items };
}

export async function getMySchedule(volunteerId: number) {
  const { rows } = await pool.query(`
    SELECT s.*, e.name as event_name, e.event_date, e.event_time, e.address,
           c.name as church_name, r.name as role_name, d.name AS department_name
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN churches c ON c.id = e.church_id
    LEFT JOIN roles r ON r.id = s.role_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE s.volunteer_id = $1
    ORDER BY e.event_date ASC
  `, [volunteerId]);
  return filterScheduleRowsHideOrphanRecusado(rows);
}

/** Escalas em que o voluntário já confirmou presença — único caso elegível para solicitar troca (apenas eventos a partir de hoje). */
export async function getMyScheduleEligibleForSwap(volunteerId: number) {
  const { rows } = await pool.query(`
    SELECT s.*, e.name as event_name, e.event_date, e.event_time, e.address,
           c.name as church_name, r.name as role_name, d.name AS department_name
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN churches c ON c.id = e.church_id
    LEFT JOIN roles r ON r.id = s.role_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE s.volunteer_id = $1
      AND s.status = 'confirmado'
      AND e.event_date >= CURRENT_DATE
    ORDER BY e.event_date ASC
  `, [volunteerId]);
  return rows;
}

/** Compromissos confirmados + exceções de indisponibilidade (fluxo de troca). */
export async function getVolunteerAvailabilityOverview(volunteerId: number) {
  const { rows: confirmed } = await pool.query(
    `
    SELECT e.name AS event_name, e.event_date::text AS event_date, e.event_time,
           r.name AS role_name, d.name AS department_name
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN roles r ON r.id = s.role_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE s.volunteer_id = $1 AND s.status = 'confirmado'
    ORDER BY e.event_date ASC, e.event_time ASC NULLS LAST
    `,
    [volunteerId]
  );
  const { rows: unavail } = await pool.query(
    `
    SELECT exception_date::text AS exception_date, period, series_id
    FROM unavailability
    WHERE volunteer_id = $1
    ORDER BY exception_date ASC, period ASC
    `,
    [volunteerId]
  );
  return {
    weekly_availability: [],
    confirmed_schedules: confirmed,
    unavailability_exceptions: unavail,
  };
}

export async function saveAvailability(volunteerId: number, slots: { day: number; period: string; available: boolean }[]) {
  for (const slot of slots) {
    await pool.query(`
      INSERT INTO availability (volunteer_id, day_of_week, period, available)
      VALUES ($1,$2,$3,$4)
      ON CONFLICT (volunteer_id, day_of_week, period) DO UPDATE SET available = $4
    `, [volunteerId, slot.day, slot.period, slot.available]);
  }
}

const PERIODS_UNAVAIL = new Set(['manha', 'tarde', 'noite', 'todos']);

/** Gera lista de datas (YYYY-MM-DD) — mesma lógica de recorrência do POST /events. */
export function expandUnavailabilityOccurrenceDates(
  startDateStr: string,
  isRecurring: boolean,
  recurrence_type: string,
  recurrence_interval: number,
  recurrence_count: number
): string[] {
  const parts = String(startDateStr).split('T')[0].split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return [];
  let lastDate = new Date(y, m - 1, d);
  if (Number.isNaN(lastDate.getTime())) return [];

  const fmt = (dt: Date) =>
    `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;

  const parsedCount = Number(recurrence_count);
  const total = isRecurring
    ? Math.min(Math.max(Number.isFinite(parsedCount) ? parsedCount : 12, 2), 52)
    : 1;
  const interval = Math.max(Number(recurrence_interval) || 1, 1);

  const dates: string[] = [];
  dates.push(fmt(lastDate));

  for (let i = 1; i < total; i++) {
    if (recurrence_type === 'daily') {
      lastDate.setDate(lastDate.getDate() + interval);
    } else if (recurrence_type === 'weekly') {
      lastDate.setDate(lastDate.getDate() + 7 * interval);
    } else if (recurrence_type === 'monthly') {
      lastDate.setMonth(lastDate.getMonth() + interval);
    } else if (recurrence_type === 'custom') {
      lastDate.setDate(lastDate.getDate() + interval);
    } else {
      break;
    }
    dates.push(fmt(lastDate));
  }
  return dates;
}

export async function listUnavailability(volunteerId: number) {
  const { rows } = await pool.query(
    `
    SELECT id, volunteer_id, exception_date, period, series_id, created_at
    FROM unavailability
    WHERE volunteer_id = $1
    ORDER BY exception_date ASC, period ASC
    `,
    [volunteerId]
  );
  return rows;
}

export async function createUnavailability(
  volunteerId: number,
  body: {
    start_date: string;
    period: string;
    is_recurring?: boolean;
    recurrence_type?: string;
    recurrence_interval?: number;
    recurrence_count?: number;
  }
) {
  const period = String(body.period || '').toLowerCase();
  if (!PERIODS_UNAVAIL.has(period)) {
    throw new Error('Período inválido (manha, tarde, noite ou todos)');
  }
  const start = String(body.start_date || '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
    throw new Error('Data inicial inválida');
  }
  const isRecurring = !!body.is_recurring;
  const recurrence_type = String(body.recurrence_type || 'weekly');
  const recurrence_interval = Math.max(Number(body.recurrence_interval) || 1, 1);
  const recurrence_count = Number(body.recurrence_count);

  const dates = expandUnavailabilityOccurrenceDates(
    start,
    isRecurring,
    recurrence_type,
    recurrence_interval,
    recurrence_count
  );
  if (dates.length === 0) {
    throw new Error('Nenhuma data gerada para a indisponibilidade');
  }

  const seriesId = isRecurring && dates.length > 1 ? randomUUID() : null;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const exception_date of dates) {
      await client.query(
        `
        INSERT INTO unavailability (volunteer_id, exception_date, period, series_id)
        VALUES ($1, $2::date, $3, $4)
        ON CONFLICT (volunteer_id, exception_date, period) DO NOTHING
        `,
        [volunteerId, exception_date, period, seriesId]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteUnavailability(id: number, volunteerId: number) {
  const { rows } = await pool.query(
    `DELETE FROM unavailability WHERE id = $1 AND volunteer_id = $2 RETURNING id`,
    [id, volunteerId]
  );
  return rows[0];
}

export async function deleteUnavailabilitySeries(seriesId: string, volunteerId: number) {
  await pool.query(`DELETE FROM unavailability WHERE series_id = $1::uuid AND volunteer_id = $2`, [
    seriesId,
    volunteerId,
  ]);
}
