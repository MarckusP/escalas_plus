import { pool } from '../database';
import { isSuperAdmin } from '../utils/rbac';

function periodFromEventTime(eventTime: string | null): 'manha' | 'tarde' | 'noite' {
  if (!eventTime) return 'noite';
  const hour = Number(String(eventTime).slice(0, 2));
  if (hour < 12) return 'manha';
  if (hour < 18) return 'tarde';
  return 'noite';
}

/** Normaliza data do Postgres (string, Date ou objeto) para evitar Date inválido e getDay() === NaN. */
function toYyyyMmDd(raw: unknown): string | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) {
      const y = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${mo}-${day}`;
    }
    return null;
  }
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const mo = String(raw.getMonth() + 1).padStart(2, '0');
    const day = String(raw.getDate()).padStart(2, '0');
    return `${y}-${mo}-${day}`;
  }
  return null;
}

function eventDateTime(eventDate: unknown, eventTime: string | null) {
  const day = toYyyyMmDd(eventDate);
  if (!day) return new Date(NaN);
  const time = eventTime || '00:00:00';
  const t = String(time).slice(0, 8);
  return new Date(`${day}T${t}`);
}

function dayOfWeekSafe(eventDate: unknown, eventTime: string | null): number {
  const dt = eventDateTime(eventDate, eventTime);
  if (Number.isNaN(dt.getTime())) {
    throw new Error('Data ou horário do evento inválido para calcular a troca');
  }
  const dow = dt.getDay();
  if (!Number.isFinite(dow) || dow < 0 || dow > 6) {
    throw new Error('Data do evento inválida');
  }
  return dow;
}

export async function getSwapCandidates(scheduleId: number, requesterId: number) {
  const { rows: scheduleRows } = await pool.query(
    `
    SELECT s.id, s.volunteer_id, s.role_id, s.status AS schedule_status,
           e.id AS event_id, e.event_date, e.event_time, e.church_id,
           d.name AS department_name, r.name AS role_label
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    LEFT JOIN roles r ON r.id = s.role_id
    LEFT JOIN departments d ON d.id = r.department_id
    WHERE s.id = $1
    `,
    [scheduleId]
  );
  const schedule = scheduleRows[0];
  if (!schedule) throw new Error('Escala não encontrada');
  if (schedule.volunteer_id !== requesterId) throw new Error('Solicitante deve ser o dono da escala');
  if (String(schedule.schedule_status || '').toLowerCase() !== 'confirmado') {
    throw new Error('Só é possível trocar escalas com participação confirmada');
  }
  const scheduleRoleId = Number(schedule.role_id);
  if (!Number.isFinite(scheduleRoleId) || scheduleRoleId < 1) {
    throw new Error('Escala sem função definida; não é possível calcular candidatos à troca');
  }

  const eventDt = eventDateTime(schedule.event_date, schedule.event_time);
  if (Number.isNaN(eventDt.getTime())) {
    throw new Error('Data do evento inválida');
  }
  const period = periodFromEventTime(schedule.event_time);
  const eventDateStr = toYyyyMmDd(schedule.event_date);
  if (!eventDateStr) throw new Error('Data do evento inválida');
  const now = new Date();
  const msToEvent = eventDt.getTime() - now.getTime();
  const canRequest = msToEvent >= 12 * 60 * 60 * 1000;

  /** Função e ministério vêm da própria linha de escala — evita desvio de role_id nos parâmetros. */
  const { rows } = await pool.query(
    `
    SELECT DISTINCT
      v.id,
      v.name,
      r_need.name AS matched_role_name,
      d_need.name AS matched_department_name,
      EXISTS (
        SELECT 1 FROM unavailability u
        WHERE u.volunteer_id = v.id
          AND u.exception_date = $3::date
          AND (u.period = $2 OR u.period = 'todos')
      ) AS blocked_by_unavailability
    FROM schedule s_anchor
    INNER JOIN roles r_need ON r_need.id = s_anchor.role_id
    INNER JOIN departments d_need ON d_need.id = r_need.department_id
    INNER JOIN volunteers v ON v.church_id = d_need.church_id
      AND v.active = true
      AND v.id <> s_anchor.volunteer_id
      AND v.role <> 'super_admin'
    INNER JOIN volunteer_roles vr ON vr.volunteer_id = v.id AND vr.role_id = r_need.id
    INNER JOIN volunteers_departments vd ON vd.volunteer_id = v.id AND vd.department_id = d_need.id
    WHERE s_anchor.id = $1
      AND s_anchor.volunteer_id = $4
    ORDER BY v.name
    `,
    [scheduleId, period, eventDateStr, requesterId]
  );

  const pgBool = (v: unknown) => v === true || v === 't' || v === 'true' || v === 1 || v === '1';

  const candidates = rows.map((r: any) => {
    const blocked = pgBool(r.blocked_by_unavailability);
    const eligible = !blocked && canRequest;
    let ineligible_reason: string | null = null;
    if (!eligible) {
      if (!canRequest) {
        ineligible_reason = 'Menos de 12 horas para o evento';
      } else if (blocked) {
        ineligible_reason = 'Indisponível nesta data (cadastro na tela de disponibilidade)';
      }
    }
    return {
      id: r.id,
      name: r.name,
      matched_role_name: r.matched_role_name,
      matched_department_name: r.matched_department_name,
      blocked_by_unavailability: blocked,
      has_availability: !blocked,
      eligible,
      ineligible_reason,
    };
  });

  const sorted = [...candidates].sort((a, b) => {
    if (a.blocked_by_unavailability !== b.blocked_by_unavailability) {
      return a.blocked_by_unavailability ? 1 : -1;
    }
    return String(a.name).localeCompare(String(b.name), 'pt');
  });

  return {
    schedule,
    can_request_now: canRequest,
    schedule_role_name: (schedule as any).role_label,
    department_name: (schedule as any).department_name,
    candidates: sorted,
  };
}

export async function requestSwap(
  requesterId: number,
  targetId: number,
  scheduleId: number,
  message: string | undefined,
  actor: { id: number; role: string; church_id: number | null }
) {
  const { rows: scheduleRows } = await pool.query(
    `
    SELECT s.id, s.volunteer_id, s.role_id, s.status AS schedule_status,
           e.id AS event_id, e.event_date, e.event_time, e.church_id
    FROM schedule s
    JOIN events e ON e.id = s.event_id
    WHERE s.id = $1
    `,
    [scheduleId]
  );
  const schedule = scheduleRows[0];
  if (!schedule) throw new Error('Escala não encontrada');

  const { rows: targetOccupied } = await pool.query(
    `
    SELECT 1 FROM schedule
    WHERE event_id = $1 AND volunteer_id = $2 AND role_id = $3
    LIMIT 1
    `,
    [schedule.event_id, targetId, schedule.role_id]
  );
  if (targetOccupied[0]) {
    throw new Error('A pessoa alvo já está escalada nesta função neste evento');
  }

  if (String(schedule.schedule_status || '').toLowerCase() !== 'confirmado') {
    throw new Error('Só é possível solicitar troca para escalas com participação confirmada');
  }
  if (schedule.role_id == null) {
    throw new Error('Escala sem função definida');
  }

  const effectiveRequesterId = actor.role === 'voluntario' ? actor.id : requesterId;
  if (actor.role === 'voluntario' && requesterId !== actor.id) {
    throw new Error('Voluntário só pode solicitar troca para si mesmo');
  }
  if (effectiveRequesterId !== schedule.volunteer_id) {
    throw new Error('Solicitante deve ser o voluntário escalado neste item');
  }
  if (effectiveRequesterId === targetId) {
    throw new Error('Solicitante e alvo da troca não podem ser iguais');
  }

  const eventDt = eventDateTime(schedule.event_date, schedule.event_time);
  if (Number.isNaN(eventDt.getTime())) {
    throw new Error('Data do evento inválida');
  }
  const now = new Date();
  const msToEvent = eventDt.getTime() - now.getTime();
  if (msToEvent < 12 * 60 * 60 * 1000) {
    throw new Error('Trocas não podem ser solicitadas com menos de 12 horas para o evento');
  }

  const { rows: targetRows } = await pool.query(
    'SELECT id, church_id FROM volunteers WHERE id = $1',
    [targetId]
  );
  const target = targetRows[0];
  if (!target) throw new Error('Voluntário alvo não encontrado');
  if (target.church_id !== schedule.church_id) throw new Error('Alvo da troca está em outra igreja');

  const { rows: minRows } = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM volunteers_departments vd
      JOIN roles r ON r.id = $1
      WHERE vd.volunteer_id = $2 AND vd.department_id = r.department_id
    ) AS ok
    `,
    [schedule.role_id, targetId]
  );
  if (!minRows[0]?.ok) {
    throw new Error('A pessoa alvo precisa estar no mesmo ministério (departamento) desta função');
  }

  const { rows: roleRows } = await pool.query(
    'SELECT 1 FROM volunteer_roles WHERE volunteer_id = $1 AND role_id = $2',
    [targetId, schedule.role_id]
  );
  if (!roleRows[0]) {
    throw new Error('A pessoa alvo precisa ter a mesma função cadastrada');
  }

  const period = periodFromEventTime(schedule.event_time);
  const eventDay = toYyyyMmDd(schedule.event_date);
  if (!eventDay) throw new Error('Data do evento inválida');
  const { rows: unavailRows } = await pool.query(
    `
    SELECT 1 FROM unavailability
    WHERE volunteer_id = $1
      AND exception_date = $2::date
      AND (period = $3 OR period = 'todos')
    LIMIT 1
    `,
    [targetId, eventDay, period]
  );
  if (unavailRows[0]) {
    throw new Error('A pessoa alvo marcou indisponibilidade nesta data e período');
  }

  const { rows } = await pool.query(
    `INSERT INTO swap_requests (requester_id, target_id, schedule_id, message, status)
     VALUES ($1,$2,$3,$4,'aguardando_aprovacao')
     RETURNING *`,
    [effectiveRequesterId, targetId, scheduleId, message]
  );
  return rows[0];
}

export async function listSwaps(
  volunteerId: number,
  role: string,
  churchId: number | null
) {
  let query = `
    SELECT sr.*, 
      req.name as requester_name, tgt.name as target_name,
      e.name as event_name, e.event_date, e.event_time
    FROM swap_requests sr
    JOIN volunteers req ON req.id = sr.requester_id
    JOIN volunteers tgt ON tgt.id = sr.target_id
    JOIN schedule s ON s.id = sr.schedule_id
    JOIN events e ON e.id = s.event_id
  `;
  const params: unknown[] = [];
  if (role === 'voluntario') {
    query += ' WHERE sr.requester_id = $1 OR sr.target_id = $1';
    params.push(volunteerId);
  } else if (!isSuperAdmin(role) && churchId != null) {
    query += ' WHERE e.church_id = $1';
    params.push(churchId);
  }
  query += ' ORDER BY sr.created_at DESC';
  const { rows } = await pool.query(query, params);
  return rows;
}

export async function reviewSwap(
  swapId: number,
  status: 'aprovado' | 'recusado',
  reviewer: { id: number; role: string; church_id: number | null }
) {
  const { rows: swapRows } = await pool.query(
    `SELECT sr.*, e.church_id AS event_church_id, e.event_date, e.event_time
     FROM swap_requests sr
     JOIN schedule s ON s.id = sr.schedule_id
     JOIN events e ON e.id = s.event_id
     WHERE sr.id = $1`,
    [swapId]
  );
  const swapMeta = swapRows[0];
  if (!swapMeta) throw new Error('Solicitação não encontrada');
  if (swapMeta.status === 'aprovado' || swapMeta.status === 'recusado') {
    throw new Error('Solicitação já finalizada');
  }

  const eventDt = eventDateTime(swapMeta.event_date, swapMeta.event_time);
  const now = new Date();
  const msToEvent = eventDt.getTime() - now.getTime();
  if (msToEvent < 12 * 60 * 60 * 1000) {
    throw new Error('Aprovação/recusa de troca não pode ocorrer com menos de 12 horas para o evento');
  }

  if (!isSuperAdmin(reviewer.role)) {
    if (swapMeta.event_church_id !== reviewer.church_id) {
      throw new Error('Solicitação fora da sua igreja');
    }
  }

  if (status === 'recusado') {
    const { rows } = await pool.query(
      'UPDATE swap_requests SET status=$1, reviewed_by=$2 WHERE id=$3 RETURNING *',
      ['recusado', reviewer.id, swapId]
    );
    return rows[0];
  }

  const isTargetApproval = reviewer.id === swapMeta.target_id;
  const isStaffApproval = isSuperAdmin(reviewer.role) || reviewer.role === 'admin' || reviewer.role === 'lider';
  if (!isTargetApproval && !isStaffApproval) {
    throw new Error('Usuário sem permissão para aprovar esta troca');
  }

  if (isTargetApproval && swapMeta.target_approved_by) {
    throw new Error('Aprovação do alvo já registrada');
  }
  if (isStaffApproval && !isTargetApproval && swapMeta.staff_approved_by) {
    throw new Error('Aprovação de gestão já registrada');
  }

  if (isTargetApproval) {
    await pool.query(
      'UPDATE swap_requests SET target_approved_by = $1, target_approved_at = NOW() WHERE id = $2',
      [reviewer.id, swapId]
    );
  } else {
    await pool.query(
      'UPDATE swap_requests SET staff_approved_by = $1, staff_approved_at = NOW() WHERE id = $2',
      [reviewer.id, swapId]
    );
  }

  const { rows: updatedRows } = await pool.query('SELECT * FROM swap_requests WHERE id = $1', [swapId]);
  const updated = updatedRows[0];

  if (updated.staff_approved_by && updated.target_approved_by) {
    await pool.query(
      'UPDATE swap_requests SET status = $1, reviewed_by = $2 WHERE id = $3',
      ['aprovado', reviewer.id, swapId]
    );
    /** Alvo e gestão já aceitaram a troca — presença confirmada sem nova pendência na tela de escalas. */
    await pool.query(
      `
      UPDATE schedule SET
        volunteer_id = (SELECT target_id FROM swap_requests WHERE id = $1),
        status = 'confirmado'
      WHERE id = (SELECT schedule_id FROM swap_requests WHERE id = $1)
    `,
      [swapId]
    );
  } else {
    await pool.query(
      'UPDATE swap_requests SET status = $1 WHERE id = $2',
      ['aguardando_aprovacao', swapId]
    );
  }

  const { rows: finalRows } = await pool.query('SELECT * FROM swap_requests WHERE id = $1', [swapId]);
  return finalRows[0];
}

export async function updateSwapTarget(
  swapId: number,
  targetId: number,
  actor: { id: number; role: string; church_id: number | null }
) {
  const { rows: swapRows } = await pool.query(
    `
    SELECT sr.*, s.role_id, e.event_date, e.event_time, e.church_id AS event_church_id
    FROM swap_requests sr
    JOIN schedule s ON s.id = sr.schedule_id
    JOIN events e ON e.id = s.event_id
    WHERE sr.id = $1
    `,
    [swapId]
  );
  const swap = swapRows[0];
  if (!swap) throw new Error('Solicitação não encontrada');
  if (swap.status !== 'aguardando_aprovacao') {
    throw new Error('Só é possível alterar alvo enquanto a solicitação está pendente');
  }

  const eventDt = eventDateTime(swap.event_date, swap.event_time);
  const now = new Date();
  const msToEvent = eventDt.getTime() - now.getTime();
  if (msToEvent < 12 * 60 * 60 * 1000) {
    throw new Error('Não é possível alterar alvo com menos de 12 horas para o evento');
  }

  const canManageAsStaff = isSuperAdmin(actor.role) || actor.role === 'admin' || actor.role === 'lider';
  const isRequesterOwner = actor.id === swap.requester_id;
  if (!canManageAsStaff && !isRequesterOwner) {
    throw new Error('Sem permissão para alterar a pessoa alvo');
  }
  if (!isSuperAdmin(actor.role) && swap.event_church_id !== actor.church_id) {
    throw new Error('Solicitação fora da sua igreja');
  }
  if (targetId === swap.requester_id) {
    throw new Error('A pessoa alvo não pode ser o solicitante');
  }

  const { rows: targetRows } = await pool.query(
    'SELECT id, church_id FROM volunteers WHERE id = $1',
    [targetId]
  );
  const target = targetRows[0];
  if (!target) throw new Error('Voluntário alvo não encontrado');
  if (target.church_id !== swap.event_church_id) {
    throw new Error('Alvo da troca está em outra igreja');
  }

  const { rows: minRows } = await pool.query(
    `
    SELECT EXISTS (
      SELECT 1 FROM volunteers_departments vd
      JOIN roles r ON r.id = $1
      WHERE vd.volunteer_id = $2 AND vd.department_id = r.department_id
    ) AS ok
    `,
    [swap.role_id, targetId]
  );
  if (!minRows[0]?.ok) {
    throw new Error('A pessoa alvo precisa estar no mesmo ministério (departamento) desta função');
  }

  const { rows: roleRows } = await pool.query(
    'SELECT 1 FROM volunteer_roles WHERE volunteer_id = $1 AND role_id = $2',
    [targetId, swap.role_id]
  );
  if (!roleRows[0]) {
    throw new Error('A pessoa alvo precisa ter a mesma função cadastrada');
  }

  const period = periodFromEventTime(swap.event_time);
  const eventDay = toYyyyMmDd(swap.event_date);
  if (!eventDay) throw new Error('Data do evento inválida');
  const { rows: unavailRows } = await pool.query(
    `
    SELECT 1 FROM unavailability
    WHERE volunteer_id = $1
      AND exception_date = $2::date
      AND (period = $3 OR period = 'todos')
    LIMIT 1
    `,
    [targetId, eventDay, period]
  );
  if (unavailRows[0]) {
    throw new Error('A pessoa alvo marcou indisponibilidade nesta data e período');
  }

  const { rows } = await pool.query(
    `
    UPDATE swap_requests
    SET
      target_id = $2,
      target_approved_by = NULL,
      target_approved_at = NULL,
      staff_approved_by = NULL,
      staff_approved_at = NULL,
      reviewed_by = NULL,
      status = 'aguardando_aprovacao'
    WHERE id = $1
    RETURNING *
    `,
    [swapId, targetId]
  );
  return rows[0];
}

export async function cancelSwap(
  swapId: number,
  actor: { id: number; role: string; church_id: number | null }
) {
  const { rows } = await pool.query(
    `
    SELECT sr.*, e.church_id
    FROM swap_requests sr
    JOIN schedule s ON s.id = sr.schedule_id
    JOIN events e ON e.id = s.event_id
    WHERE sr.id = $1
    `,
    [swapId]
  );
  const swap = rows[0];
  if (!swap) throw new Error('Solicitação não encontrada');
  if (swap.status === 'aprovado' || swap.status === 'recusado') {
    throw new Error('Solicitação já finalizada');
  }

  const isOwner = swap.requester_id === actor.id;
  const isStaff = isSuperAdmin(actor.role) || actor.role === 'admin' || actor.role === 'lider';
  if (!isOwner && !isStaff) throw new Error('Sem permissão para cancelar a solicitação');
  if (!isSuperAdmin(actor.role) && swap.church_id !== actor.church_id) {
    throw new Error('Solicitação fora da sua igreja');
  }

  await pool.query('DELETE FROM swap_requests WHERE id = $1', [swapId]);
}
