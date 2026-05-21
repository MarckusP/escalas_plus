import { pool } from '../database';
import * as waDispatch from './whatsappDispatch';
import { leaderDepartmentIds } from './accessService';

const PURGE_JOB = 'notifications_purge';

export type NotificationRow = {
  id: number;
  type: string;
  title: string;
  body: string | null;
  link_path: string | null;
  read_at: string | null;
  created_at: string;
};

async function upsertNotification(p: {
  recipientId: number;
  type: string;
  title: string;
  body?: string;
  linkPath?: string;
  churchId?: number | null;
  referenceType?: string;
  referenceId?: number;
  referenceCompletedAt?: Date | string | null;
  dedupeKey: string;
}) {
  await pool.query(
    `
    INSERT INTO notifications (
      recipient_id, type, title, body, link_path, church_id,
      reference_type, reference_id, reference_completed_at, dedupe_key
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT (recipient_id, dedupe_key) DO UPDATE SET
      title = EXCLUDED.title,
      body = EXCLUDED.body,
      link_path = EXCLUDED.link_path,
      reference_completed_at = COALESCE(EXCLUDED.reference_completed_at, notifications.reference_completed_at),
      created_at = CASE
        WHEN notifications.read_at IS NULL THEN notifications.created_at
        ELSE NOW()
      END
    `,
    [
      p.recipientId,
      p.type,
      p.title,
      p.body ?? null,
      p.linkPath ?? null,
      p.churchId ?? null,
      p.referenceType ?? null,
      p.referenceId ?? null,
      p.referenceCompletedAt ?? null,
      p.dedupeKey,
    ]
  );
}

async function staffRecipientIds(churchId: number): Promise<number[]> {
  const { rows } = await pool.query(
    `
    SELECT id FROM volunteers
    WHERE active = true AND status = 'active'
      AND role IN ('admin', 'lider')
      AND church_id = $1
    `,
    [churchId]
  );
  return rows.map((r: { id: number }) => r.id);
}

async function leaderIdsForDepartments(churchId: number, deptIds: number[]): Promise<number[]> {
  if (deptIds.length === 0) return [];
  const { rows } = await pool.query(
    `
    SELECT DISTINCT vd.volunteer_id AS id
    FROM volunteers_departments vd
    JOIN volunteers v ON v.id = vd.volunteer_id
    WHERE vd.is_leader = true
      AND vd.department_id = ANY($1::int[])
      AND v.church_id = $2
      AND v.active = true
      AND v.status = 'active'
    `,
    [deptIds, churchId]
  );
  return rows.map((r: { id: number }) => r.id);
}

export async function notifyEventCreated(
  churchId: number,
  eventId: number,
  eventName: string,
  eventDate: string
) {
  const ids = await staffRecipientIds(churchId);
  const dateLabel = eventDate?.slice(0, 10) || '';
  for (const rid of ids) {
    await upsertNotification({
      recipientId: rid,
      type: 'event_created',
      title: 'Novo evento criado',
      body: `${eventName} — ${dateLabel}`,
      linkPath: '/admin/organizacao/eventos',
      churchId,
      referenceType: 'event',
      referenceId: eventId,
      dedupeKey: `event_created:${eventId}:${rid}`,
    });
  }
  void waDispatch.dispatchWhatsAppNotification({
    type: 'event_created',
    title: 'Novo evento criado',
    body: `${eventName} — ${dateLabel}`,
    linkPath: '/admin/organizacao/eventos',
    referenceType: 'event',
    referenceId: eventId,
    generalBroadcast: true,
  });
}

export async function notifyScheduleAssigned(
  volunteerId: number,
  scheduleId: number,
  eventName: string,
  roleName: string,
  churchId: number | null,
  eventDate: string
) {
  await upsertNotification({
    recipientId: volunteerId,
    type: 'schedule_assigned',
    title: 'Nova escala atribuída',
    body: `${eventName} — ${roleName}`,
    linkPath: '/escalas',
    churchId,
    referenceType: 'schedule',
    referenceId: scheduleId,
    dedupeKey: `schedule_assigned:${scheduleId}`,
  });
  void waDispatch.dispatchWhatsAppNotification({
    type: 'schedule_assigned',
    title: 'Nova escala atribuída',
    body: `${eventName} — ${roleName}`,
    linkPath: '/escalas',
    recipientIds: [volunteerId],
    referenceType: 'schedule',
    referenceId: scheduleId,
  });
}

export async function notifySwapActivity(
  recipientIds: number[],
  swapId: number,
  title: string,
  body: string,
  churchId: number | null
) {
  const unique = [...new Set(recipientIds.filter(id => id > 0))];
  for (const rid of unique) {
    await upsertNotification({
      recipientId: rid,
      type: 'swap',
      title,
      body,
      linkPath: '/trocas',
      churchId,
      referenceType: 'swap',
      referenceId: swapId,
      dedupeKey: `swap:${swapId}:${rid}:${title.slice(0, 24)}`,
    });
  }
}

export async function notifyRegistrationPending(
  churchId: number,
  volunteerId: number,
  volunteerName: string,
  departmentIds: number[]
) {
  const adminIds = await staffRecipientIds(churchId);
  const leaderIds = await leaderIdsForDepartments(churchId, departmentIds);
  const recipients = [...new Set([...adminIds, ...leaderIds])];
  for (const rid of recipients) {
    await upsertNotification({
      recipientId: rid,
      type: 'registration_pending',
      title: 'Cadastro público pendente',
      body: `${volunteerName} aguarda aprovação`,
      linkPath: '/admin/pessoas/voluntarios',
      churchId,
      referenceType: 'volunteer',
      referenceId: volunteerId,
      dedupeKey: `registration_pending:${volunteerId}:${rid}`,
    });
  }
  void waDispatch.dispatchWhatsAppNotification({
    type: 'registration_pending',
    title: 'Cadastro público pendente',
    body: `${volunteerName} aguarda aprovação`,
    linkPath: '/admin/pessoas/voluntarios',
    recipientIds: recipients,
    referenceType: 'volunteer',
    referenceId: volunteerId,
  });
}

export async function syncNotificationsForUser(
  userId: number,
  role: string,
  churchId: number | null
): Promise<void> {
  if (role === 'voluntario') {
    const { rows: pendingSched } = await pool.query(
      `
      SELECT s.id, e.name AS event_name, r.name AS role_name, e.event_date, e.church_id
      FROM schedule s
      JOIN events e ON e.id = s.event_id
      LEFT JOIN roles r ON r.id = s.role_id
      WHERE s.volunteer_id = $1 AND s.status = 'pendente'
        AND e.event_date >= CURRENT_DATE - INTERVAL '1 day'
      `,
      [userId]
    );
    for (const row of pendingSched) {
      await upsertNotification({
        recipientId: userId,
        type: 'schedule_pending',
        title: 'Escala pendente de confirmação',
        body: `${row.event_name} — ${row.role_name || 'Função'}`,
        linkPath: '/escalas',
        churchId: row.church_id,
        referenceType: 'schedule',
        referenceId: row.id,
        dedupeKey: `schedule_pending:${row.id}`,
      });
    }

    const { rows: doneSched } = await pool.query(
      `
      SELECT s.id, e.event_date
      FROM schedule s
      JOIN events e ON e.id = s.event_id
      WHERE s.volunteer_id = $1
        AND e.event_date < CURRENT_DATE
      `,
      [userId]
    );
    for (const row of doneSched) {
      await pool.query(
        `UPDATE notifications SET reference_completed_at = $2::timestamp
         WHERE reference_type = 'schedule' AND reference_id = $1 AND recipient_id = $3`,
        [row.id, row.event_date, userId]
      );
    }
  }

  const leaderDepts = role === 'lider' ? await leaderDepartmentIds(userId) : [];

  if (role === 'admin' || role === 'lider' || role === 'super_admin') {
    const churchFilter =
      role === 'super_admin'
        ? ''
        : 'AND e.church_id = $1';
    const params = role === 'super_admin' ? [] : [churchId];

    const pendingVolQuery =
      role === 'lider' && leaderDepts.length > 0
        ? `
      SELECT DISTINCT v.id, v.name, v.church_id
      FROM volunteers v
      JOIN volunteers_departments vd ON vd.volunteer_id = v.id
      WHERE v.status = 'pending' AND v.role = 'voluntario'
        AND v.church_id = $1 AND vd.department_id = ANY($2::int[])
      `
        : `
      SELECT v.id, v.name, v.church_id
      FROM volunteers v
      WHERE v.status = 'pending' AND v.role = 'voluntario'
        ${role === 'super_admin' ? '' : 'AND v.church_id = $1'}
      `;

    const pendingParams =
      role === 'lider' && leaderDepts.length > 0
        ? [churchId, leaderDepts]
        : role === 'super_admin'
          ? []
          : [churchId];

    const { rows: pendingVols } = await pool.query(pendingVolQuery, pendingParams);
    for (const v of pendingVols) {
      await upsertNotification({
        recipientId: userId,
        type: 'registration_pending',
        title: 'Cadastro pendente',
        body: v.name,
        linkPath: '/admin/pessoas/voluntarios',
        churchId: v.church_id,
        referenceType: 'volunteer',
        referenceId: v.id,
        dedupeKey: `registration_pending:${v.id}:${userId}`,
      });
    }

    const schedPendingSql =
      role === 'lider' && leaderDepts.length > 0
        ? `
      SELECT s.id, e.name AS event_name, v.name AS vol_name, e.church_id
      FROM schedule s
      JOIN events e ON e.id = s.event_id
      JOIN volunteers v ON v.id = s.volunteer_id
      JOIN volunteers_departments vd ON vd.volunteer_id = v.id
      WHERE s.status = 'pendente' AND e.event_date >= CURRENT_DATE
        AND e.church_id = $1 AND vd.department_id = ANY($2::int[])
      `
        : `
      SELECT s.id, e.name AS event_name, v.name AS vol_name, e.church_id
      FROM schedule s
      JOIN events e ON e.id = s.event_id
      JOIN volunteers v ON v.id = s.volunteer_id
      WHERE s.status = 'pendente' AND e.event_date >= CURRENT_DATE
        ${churchFilter}
      `;
    const { rows: teamPending } = await pool.query(
      schedPendingSql,
      role === 'lider' && leaderDepts.length > 0 ? [churchId, leaderDepts] : params
    );
    for (const row of teamPending) {
      await upsertNotification({
        recipientId: userId,
        type: 'schedule_pending',
        title: 'Escala aguardando confirmação',
        body: `${row.vol_name} — ${row.event_name}`,
        linkPath: '/admin/organizacao/eventos',
        churchId: row.church_id,
        referenceType: 'schedule',
        referenceId: row.id,
        dedupeKey: `schedule_pending_team:${row.id}:${userId}`,
      });
    }
  }

  let taskFilter = 'TRUE';
  let taskParams: (number | null)[] = [];
  if (role === 'voluntario') {
    taskFilter = '(t.assigned_to = $1 OR t.created_by = $1)';
    taskParams = [userId];
  } else if (role === 'super_admin') {
    taskFilter = 'TRUE';
    taskParams = [];
  } else {
    taskFilter = 't.church_id = $1';
    taskParams = [churchId];
  }

  const { rows: openTasks } = await pool.query(
    `
    SELECT t.id, t.title, t.due_date, t.status, t.church_id, t.assigned_to,
           t.requested_status IS NOT NULL AS needs_approval
    FROM tasks t
    WHERE ${taskFilter}
      AND t.status != 'entregue'
    `,
    taskParams
  );

  for (const t of openTasks) {
    const isAssignee = Number(t.assigned_to) === userId;
    if (t.needs_approval && (role === 'admin' || role === 'lider' || role === 'super_admin')) {
      await upsertNotification({
        recipientId: userId,
        type: 'task_pending',
        title: 'Tarefa aguardando aprovação',
        body: t.title,
        linkPath: '/tarefas',
        churchId: t.church_id,
        referenceType: 'task',
        referenceId: t.id,
        dedupeKey: `task_approval:${t.id}:${userId}`,
      });
    }
    if (isAssignee || role === 'admin' || role === 'lider') {
      await upsertNotification({
        recipientId: userId,
        type: 'task_pending',
        title: 'Tarefa em aberto',
        body: t.title,
        linkPath: '/tarefas',
        churchId: t.church_id,
        referenceType: 'task',
        referenceId: t.id,
        dedupeKey: `task_open:${t.id}:${userId}`,
      });
    }
    if (
      t.due_date &&
      isAssignee &&
      new Date(t.due_date).getTime() - Date.now() < 24 * 60 * 60 * 1000
    ) {
      await upsertNotification({
        recipientId: userId,
        type: 'task_due_soon',
        title: 'Tarefa vence em menos de 1 dia',
        body: t.title,
        linkPath: '/tarefas',
        churchId: t.church_id,
        referenceType: 'task',
        referenceId: t.id,
        dedupeKey: `task_due:${t.id}:${userId}`,
      });
    }
  }

  await pool.query(
    `
    UPDATE notifications n
    SET reference_completed_at = NOW()
    FROM tasks t
    WHERE n.reference_type = 'task' AND n.reference_id = t.id
      AND n.recipient_id = $1
      AND t.status = 'entregue'
      AND n.reference_completed_at IS NULL
    `,
    [userId]
  );

  const { rows: activeSwaps } = await pool.query(
    `
    SELECT sr.id, sr.status, sr.requester_id, sr.target_id,
           req.name AS requester_name, tgt.name AS target_name
    FROM swap_requests sr
    JOIN volunteers req ON req.id = sr.requester_id
    JOIN volunteers tgt ON tgt.id = sr.target_id
    WHERE sr.status = 'aguardando_aprovacao'
      AND ($2::boolean IS TRUE OR req.church_id = $1 OR tgt.church_id = $1)
      AND (
        sr.requester_id = $3 OR sr.target_id = $3
        OR $4 IN ('admin', 'lider', 'super_admin')
      )
    `,
    [churchId, role === 'super_admin', userId, role]
  );

  for (const sw of activeSwaps) {
    const involved =
      sw.requester_id === userId ||
      sw.target_id === userId ||
      role === 'admin' ||
      role === 'lider' ||
      role === 'super_admin';
    if (!involved) continue;
    await upsertNotification({
      recipientId: userId,
      type: 'swap',
      title: 'Troca de escala pendente',
      body: `${sw.requester_name} → ${sw.target_name}`,
      linkPath: '/trocas',
      churchId: churchId ?? null,
      referenceType: 'swap',
      referenceId: sw.id,
      dedupeKey: `swap_pending:${sw.id}:${userId}`,
    });
  }
}

export async function listNotifications(userId: number): Promise<NotificationRow[]> {
  const { rows } = await pool.query(
    `
    SELECT id, type, title, body, link_path, read_at, created_at
    FROM notifications
    WHERE recipient_id = $1
      AND (
        read_at IS NULL
        OR reference_completed_at IS NULL
        OR reference_completed_at >= NOW() - INTERVAL '14 days'
      )
    ORDER BY read_at NULLS FIRST, created_at DESC
    LIMIT 80
    `,
    [userId]
  );
  return rows;
}

export async function unreadCount(userId: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c FROM notifications WHERE recipient_id = $1 AND read_at IS NULL`,
    [userId]
  );
  return rows[0]?.c ?? 0;
}

export async function toastQueue(userId: number): Promise<NotificationRow[]> {
  const { rows } = await pool.query(
    `
    SELECT id, type, title, body, link_path, read_at, created_at
    FROM notifications
    WHERE recipient_id = $1
      AND read_at IS NULL
      AND toast_shown_at IS NULL
    ORDER BY created_at ASC
    LIMIT 15
    `,
    [userId]
  );
  return rows;
}

export async function markToastShown(id: number, userId: number) {
  await pool.query(
    `UPDATE notifications SET toast_shown_at = NOW() WHERE id = $1 AND recipient_id = $2`,
    [id, userId]
  );
}

export async function markRead(id: number, userId: number) {
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE id = $1 AND recipient_id = $2`,
    [id, userId]
  );
}

export async function markAllRead(userId: number) {
  await pool.query(
    `UPDATE notifications SET read_at = NOW() WHERE recipient_id = $1 AND read_at IS NULL`,
    [userId]
  );
}

export async function runNotificationPurgeIfDue(): Promise<void> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10);
  const { rows } = await pool.query(
    'SELECT last_run_date FROM scheduler_runs WHERE job_name = $1',
    [PURGE_JOB]
  );
  if (rows[0] && String(rows[0].last_run_date).slice(0, 10) === dateStr) return;

  await pool.query('SELECT purge_read_notifications_after_completion()');
  await pool.query(
    `
    INSERT INTO scheduler_runs (job_name, last_run_date)
    VALUES ($1, $2::date)
    ON CONFLICT (job_name) DO UPDATE SET last_run_date = EXCLUDED.last_run_date
    `,
    [PURGE_JOB, dateStr]
  );
}

export function scheduleNotificationPurge(): void {
  runNotificationPurgeIfDue().catch(err =>
    console.error('Erro no purge de notificações:', err)
  );
  setInterval(() => {
    runNotificationPurgeIfDue().catch(err =>
      console.error('Erro no purge de notificações:', err)
    );
  }, 24 * 60 * 60 * 1000);
}
