import { pool } from '../database';
import type { AuthRequest } from '../middlewares/auth';
import { isSuperAdmin } from '../utils/rbac';

export class AccessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccessError';
  }
}

export async function assertEventInUserScope(eventId: number, req: AuthRequest) {
  const { rows } = await pool.query('SELECT church_id FROM events WHERE id = $1', [eventId]);
  if (!rows[0]) throw new AccessError('Evento não encontrado');
  if (isSuperAdmin(req.user!.role)) return;
  if (rows[0].church_id !== req.user!.church_id) throw new AccessError('Evento fora da sua igreja');
  if (req.user!.role === 'lider') {
    const { rows: depts } = await pool.query(
      'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
      [req.user!.id]
    );
    if (depts.length === 0) throw new AccessError('Acesso negado');
    return;
  }
}

export async function leaderDepartmentIds(leaderVolunteerId: number): Promise<number[]> {
  const { rows } = await pool.query(
    'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
    [leaderVolunteerId]
  );
  return rows.map((r: { department_id: number }) => Number(r.department_id));
}

export async function volunteerSharesLeaderDepartment(
  volunteerId: number,
  leaderDeptIds: number[]
): Promise<boolean> {
  if (leaderDeptIds.length === 0) return false;
  const { rows } = await pool.query(
    'SELECT 1 FROM volunteers_departments WHERE volunteer_id = $1 AND department_id = ANY($2) LIMIT 1',
    [volunteerId, leaderDeptIds]
  );
  return !!rows[0];
}

/** Líder: mesmo ministério; pendente só com ministério em comum; ativo na mesma igreja para concluir cadastro. */
export async function liderCanAccessVolunteer(
  volunteerId: number,
  req: AuthRequest
): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT role, church_id, status FROM volunteers WHERE id = $1',
    [volunteerId]
  );
  const v = rows[0];
  if (!v || v.role === 'super_admin') return false;
  const leaderChurchId = req.user!.church_id;
  const deptIds = await leaderDepartmentIds(req.user!.id);
  if (deptIds.length === 0) return false;
  if (await volunteerSharesLeaderDepartment(volunteerId, deptIds)) return true;
  if (
    v.role === 'voluntario' &&
    leaderChurchId != null &&
    v.church_id === leaderChurchId &&
    v.status === 'active'
  ) {
    return true;
  }
  return false;
}

export async function assertVolunteerInUserScope(volunteerId: number, req: AuthRequest) {
  const { rows } = await pool.query(
    'SELECT role, church_id, status FROM volunteers WHERE id = $1',
    [volunteerId]
  );
  if (!rows[0]) throw new AccessError('Voluntário não encontrado');
  if (isSuperAdmin(req.user!.role)) return;
  const v = rows[0];
  if (v.role === 'super_admin') throw new AccessError('Acesso negado');
  if (req.user!.role === 'lider') {
    const leaderChurchId = req.user!.church_id;
    const deptIds = await leaderDepartmentIds(req.user!.id);
    if (deptIds.length === 0) throw new AccessError('Acesso negado');

    if (v.status === 'pending') {
      if (leaderChurchId == null || v.church_id !== leaderChurchId) {
        throw new AccessError('Voluntário pendente de outra igreja');
      }
      if (!(await volunteerSharesLeaderDepartment(volunteerId, deptIds))) {
        throw new AccessError('Voluntário pendente de outro ministério');
      }
      return;
    }

    if (await liderCanAccessVolunteer(volunteerId, req)) return;
    throw new AccessError('Voluntário fora do seu ministério');
  }
  if (v.church_id !== req.user!.church_id) throw new AccessError('Voluntário fora da sua igreja');
}

export async function assertDepartmentInUserScope(departmentId: number, req: AuthRequest) {
  const { rows } = await pool.query('SELECT church_id FROM departments WHERE id = $1', [departmentId]);
  if (!rows[0]) throw new AccessError('Departamento não encontrado');
  if (isSuperAdmin(req.user!.role)) return;
  if (req.user!.role === 'lider') {
    // Lider can only access departments they lead
    const { rows: leaderRows } = await pool.query(
      'SELECT 1 FROM volunteers_departments WHERE volunteer_id = $1 AND department_id = $2 AND is_leader = true',
      [req.user!.id, departmentId]
    );
    if (leaderRows.length === 0) throw new AccessError('Departamento fora do seu escopo');
    return;
  }
  if (rows[0].church_id !== req.user!.church_id) throw new AccessError('Departamento fora da sua igreja');
}

export async function assertScheduleInUserScope(scheduleId: number, req: AuthRequest) {
  const { rows } = await pool.query(
    `SELECT e.church_id, s.volunteer_id FROM schedule s
     JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
    [scheduleId]
  );
  if (!rows[0]) throw new AccessError('Escala não encontrada');
  if (isSuperAdmin(req.user!.role)) return;
  if (req.user!.role === 'lider') {
    // Check if the scheduled volunteer is in leader's departments
    const { rows: leaderDepts } = await pool.query(
      'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
      [req.user!.id]
    );
    if (leaderDepts.length === 0) throw new AccessError('Acesso negado');
    const deptIds = leaderDepts.map((d: any) => d.department_id);
    const { rows: volDepts } = await pool.query(
      'SELECT 1 FROM volunteers_departments WHERE volunteer_id = $1 AND department_id = ANY($2)',
      [rows[0].volunteer_id, deptIds]
    );
    if (volDepts.length === 0) throw new AccessError('Escala fora do seu ministério');
    return;
  }
  if (rows[0].church_id !== req.user!.church_id) throw new AccessError('Escala fora da sua igreja');
}

export async function assertTaskInUserScope(taskId: number, req: AuthRequest) {
  const { rows } = await pool.query(
    `SELECT t.church_id,
            cb.church_id AS creator_church, asg.church_id AS assignee_church,
            asg.id AS assignee_id, cb.id AS creator_id
     FROM tasks t
     LEFT JOIN volunteers cb ON cb.id = t.created_by
     LEFT JOIN volunteers asg ON asg.id = t.assigned_to
     WHERE t.id = $1`,
    [taskId]
  );
  if (!rows[0]) throw new AccessError('Tarefa não encontrada');
  if (isSuperAdmin(req.user!.role)) return;
  const cid = req.user!.church_id;
  if (req.user!.role === 'lider') {
    if (rows[0].church_id !== cid) throw new AccessError('Tarefa fora da sua igreja');
    return;
  }
  const ok =
    rows[0].church_id === cid ||
    rows[0].creator_church === cid ||
    rows[0].assignee_church === cid;
  if (!ok) throw new AccessError('Tarefa fora da sua igreja');
}

export async function getEventChurchId(eventId: number): Promise<number | null> {
  const { rows } = await pool.query('SELECT church_id FROM events WHERE id = $1', [eventId]);
  return rows[0]?.church_id ?? null;
}
