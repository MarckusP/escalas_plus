import { Router } from 'express';
import { pool } from '../database';
import { authMiddleware, requireRole, AuthRequest } from '../middlewares/auth';
import * as authService from '../services/authService';
import * as scheduleService from '../services/scheduleService';
import * as approvalService from '../services/approvalService';
import * as satisfactionService from '../services/satisfactionService';
import {
  AccessError,
  assertEventInUserScope,
  assertVolunteerInUserScope,
  liderCanAccessVolunteer,
  assertDepartmentInUserScope,
  assertScheduleInUserScope,
  assertTaskInUserScope,
} from '../services/accessService';
import { isSuperAdmin } from '../utils/rbac';
import { getReportScope, scopeParams } from '../services/reportScope';
import { assertPassword } from '../utils/passwordPolicy';
import * as notificationService from '../services/notificationService';
import * as waDispatch from '../services/whatsappDispatch';
import authExtendedRoutes from './authExtendedRoutes';
import whatsappRoutes from './whatsappRoutes';
import environmentRoutes from './environmentRoutes';
import { toE164 } from '../utils/phone';
import * as authExtended from '../services/authExtendedService';

const router = Router();
router.use(authExtendedRoutes);
router.use(whatsappRoutes);
router.use(environmentRoutes);

function handleAccessError(res: import('express').Response, e: unknown) {
  if (e instanceof AccessError) {
    res.status(403).json({ error: e.message });
    return true;
  }
  return false;
}

async function validateAssignmentsForChurch(
  client: { query: (sql: string, params?: any[]) => Promise<any> },
  churchId: number,
  assignments: any[]
) {
  for (const ass of assignments) {
    if (!ass.role_id) continue;
    const roleId = Number(ass.role_id);
    const volunteerId =
      ass.volunteer_id && ass.volunteer_id !== '' && ass.volunteer_id !== 'null'
        ? Number(ass.volunteer_id)
        : null;

    const { rows: roleRows } = await client.query(
      `
      SELECT d.church_id
      FROM roles r
      JOIN departments d ON d.id = r.department_id
      WHERE r.id = $1
      `,
      [roleId]
    );
    if (!roleRows[0]) throw new Error(`Função inválida no assignment (${roleId})`);
    if (Number(roleRows[0].church_id) !== churchId) {
      throw new Error(`Função ${roleId} não pertence à igreja do evento`);
    }

    if (volunteerId) {
      const { rows: volRows } = await client.query(
        'SELECT church_id FROM volunteers WHERE id = $1',
        [volunteerId]
      );
      if (!volRows[0]) throw new Error(`Voluntário inválido no assignment (${volunteerId})`);
      if (Number(volRows[0].church_id) !== churchId) {
        throw new Error(`Voluntário ${volunteerId} não pertence à igreja do evento`);
      }
      const { rows: volRoleRows } = await client.query(
        'SELECT 1 FROM volunteer_roles WHERE volunteer_id = $1 AND role_id = $2',
        [volunteerId, roleId]
      );
      if (!volRoleRows[0]) {
        throw new Error(`Voluntário ${volunteerId} não possui a função ${roleId}`);
      }
    }
  }
}

async function assertCanManageDepartment(departmentId: number, req: AuthRequest) {
  const u = req.user!;
  if (isSuperAdmin(u.role)) return;

  const { rows } = await pool.query('SELECT church_id FROM departments WHERE id = $1', [departmentId]);
  if (!rows[0]) throw new AccessError('Departamento não encontrado');

  if (u.role === 'admin') {
    if (rows[0].church_id !== u.church_id) throw new AccessError('Departamento fora da sua igreja');
    return;
  }

  if (u.role === 'lider') {
    const { rows: lRows } = await pool.query(
      'SELECT 1 FROM volunteers_departments WHERE department_id = $1 AND volunteer_id = $2 AND is_leader = true',
      [departmentId, u.id]
    );
    if (lRows.length === 0) throw new AccessError('Apenas líder do departamento pode gerenciar esta área');
    return;
  }

  throw new AccessError('Acesso negado');
}

// ===== AUTH ===== (login/2FA/Google em authExtendedRoutes)

router.post('/auth/register', authMiddleware, requireRole('super_admin', 'admin'), async (req: AuthRequest, res) => {
  try {
    const { name, email, password, role, church_id, phone_ddd, phone_number } = req.body;
    const r = (role || 'voluntario') as string;
    const caller = req.user!;

    if (r === 'super_admin') {
      if (!isSuperAdmin(caller.role)) {
        res.status(403).json({ error: 'Apenas super administrador pode criar outro super administrador' });
        return;
      }
    } else if (r === 'admin') {
      if (!isSuperAdmin(caller.role)) {
        res.status(403).json({ error: 'Apenas super administrador pode criar administrador de igreja' });
        return;
      }
      if (church_id == null || church_id === '') {
        res.status(400).json({ error: 'church_id é obrigatório para administrador de igreja' });
        return;
      }
    } else if (r === 'lider' || r === 'voluntario') {
      if (!isSuperAdmin(caller.role) && caller.role !== 'admin') {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
      const cid =
        church_id != null && church_id !== '' ? Number(church_id) : caller.church_id;
      if (cid == null) {
        res.status(400).json({ error: 'church_id é obrigatório' });
        return;
      }
      if (!isSuperAdmin(caller.role) && cid !== caller.church_id) {
        res.status(403).json({ error: 'Não é possível atribuir usuário a outra igreja' });
        return;
      }
    }

    const resolvedChurch =
      r === 'super_admin'
        ? null
        : r === 'admin'
          ? Number(church_id)
          : church_id != null && church_id !== ''
            ? Number(church_id)
            : caller.church_id;

    const user = await authService.register({
      name,
      email,
      password,
      role: r,
      church_id: resolvedChurch,
      status: 'active',
      phone_ddd,
      phone_number,
    });
    res.json(user);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/public/signup-options', async (req, res) => {
  try {
    const churchId = Number(req.query.church_id);
    if (!Number.isFinite(churchId) || churchId < 1) {
      res.status(400).json({ error: 'church_id inválido' });
      return;
    }
    const { rows: departments } = await pool.query(
      'SELECT id, name, icon FROM departments WHERE church_id = $1 ORDER BY name',
      [churchId]
    );
    const { rows: roles } = await pool.query(
      `
      SELECT r.id, r.name, r.department_id, d.name AS department_name
      FROM roles r
      JOIN departments d ON d.id = r.department_id
      WHERE d.church_id = $1
      ORDER BY d.name, r.name
      `,
      [churchId]
    );
    res.json({ departments, roles });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/register-public', async (req, res) => {
  const { church_id, phone_ddd, phone_number, department_ids, role_ids, verify_token, login_otp_channel } =
    req.body;
  if (church_id == null || church_id === '' || church_id === 'null') {
    res.status(400).json({ error: 'Selecione uma igreja válida para continuar' });
    return;
  }
  const cid = Number(church_id);
  const deptIds = (Array.isArray(department_ids) ? department_ids : [])
    .map((id: unknown) => Number(id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
  const roleIds = (Array.isArray(role_ids) ? role_ids : [])
    .map((id: unknown) => Number(id))
    .filter((id: number) => Number.isFinite(id) && id > 0);
  if (deptIds.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos um ministério' });
    return;
  }
  if (roleIds.length === 0) {
    res.status(400).json({ error: 'Selecione ao menos uma função' });
    return;
  }

  if (!verify_token) {
    res.status(400).json({ error: 'Valide seu telefone ou e-mail antes de concluir o cadastro' });
    return;
  }

  let user: { id: number; name?: string } | null = null;
  const client = await pool.connect();
  try {
    const created = await authExtended.registerWithVerifyToken(verify_token, {
      name: req.body.name,
      email: req.body.email,
      password: req.body.password,
      phone_ddd,
      phone_number,
      church_id: cid,
      login_otp_channel: login_otp_channel === 'email' ? 'email' : 'whatsapp',
    });
    user = created;
    const vid = Number(created.id);

    await client.query('BEGIN');
    for (const deptId of deptIds) {
      const { rows: deptRows } = await client.query(
        'SELECT id FROM departments WHERE id = $1 AND church_id = $2',
        [deptId, cid]
      );
      if (!deptRows[0]) throw new Error('Ministério inválido para esta igreja');
      await client.query(
        `INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
         VALUES ($1, $2, false)
         ON CONFLICT (volunteer_id, department_id) DO NOTHING`,
        [vid, deptId]
      );
    }
    for (const roleId of roleIds) {
      const { rows: roleRows } = await client.query(
        `
        SELECT r.id FROM roles r
        JOIN departments d ON d.id = r.department_id
        WHERE r.id = $1 AND d.church_id = $2 AND r.department_id = ANY($3::int[])
        `,
        [roleId, cid, deptIds]
      );
      if (!roleRows[0]) throw new Error('Função inválida para os ministérios selecionados');
      await client.query(
        `INSERT INTO volunteer_roles (volunteer_id, role_id)
         VALUES ($1, $2)
         ON CONFLICT (volunteer_id, role_id) DO NOTHING`,
        [vid, roleId]
      );
    }
    await client.query('COMMIT');
    notificationService
      .notifyRegistrationPending(cid, vid, String(created.name || req.body.name || ''), deptIds)
      .catch(() => {});
    res.json(user);
  } catch (e: any) {
    await client.query('ROLLBACK').catch(() => {});
    if (user?.id) {
      await pool.query('DELETE FROM volunteer_roles WHERE volunteer_id = $1', [user.id]);
      await pool.query('DELETE FROM volunteers_departments WHERE volunteer_id = $1', [user.id]);
      await pool.query('DELETE FROM volunteers WHERE id = $1', [user.id]);
    }
    res.status(400).json({ error: e.message });
  } finally {
    client.release();
  }
});

router.patch('/auth/admin/approve/:id', authMiddleware, requireRole('super_admin'), async (req: AuthRequest, res) => {
  try {
    const adminId = Number(req.params.id);
    const updated = await authService.approveAdminGeneral(adminId);
    res.json(updated);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== VOLUNTEERS =====
router.get('/volunteers', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  const isSuper = isSuperAdmin(u.role);

  if (u.role === 'lider') {
    // Lider sees only volunteers from their departments
    const { rows: leaderDepts } = await pool.query(
      'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
      [u.id]
    );
    if (leaderDepts.length === 0) {
      return res.json([]);
    }
    const deptIds: number[] = leaderDepts.map((d: any) => d.department_id);
    const placeholders = deptIds.map((_, i) => `$${i + 2}`).join(',');
    const { rows } = await pool.query(
      `
      SELECT DISTINCT v.*, ch.name AS church_name,
        CASE WHEN v.status = 'pending' THEN 0 ELSE 1 END AS _sort_pending
      FROM volunteers v
      LEFT JOIN churches ch ON ch.id = v.church_id
      WHERE v.role != 'super_admin'
        AND v.church_id = $1
        AND EXISTS (
          SELECT 1 FROM volunteers_departments vd_f
          WHERE vd_f.volunteer_id = v.id AND vd_f.department_id IN (${placeholders})
        )
      ORDER BY _sort_pending, v.name
      `,
      [u.church_id, ...deptIds]
    );

    const roleId = req.query.role_id ? Number(req.query.role_id) : null;
    const excludeDate = req.query.exclude_date as string;
    const excludeEventId = req.query.exclude_event_id ? Number(req.query.exclude_event_id) : null;

    const filteredRows = [];
    for (const row of rows) {
      if (roleId) {
        const { rows: hasRole } = await pool.query(
          'SELECT 1 FROM volunteer_roles WHERE volunteer_id = $1 AND role_id = $2',
          [row.id, roleId]
        );
        if (hasRole.length === 0) continue;
      }

      if (excludeEventId && Number.isFinite(excludeEventId) && excludeEventId > 0) {
        const occupiedParams: (number | string)[] = [row.id, excludeEventId];
        let occupiedSql = `
          SELECT 1 FROM schedule s
          WHERE s.volunteer_id = $1 AND s.event_id = $2`;
        if (roleId) {
          occupiedSql += ' AND s.role_id = $3';
          occupiedParams.push(roleId);
        }
        occupiedSql += ' LIMIT 1';
        const { rows: isOccupied } = await pool.query(occupiedSql, occupiedParams);
        if (isOccupied.length > 0) continue;
      } else if (excludeDate) {
        const { rows: isOccupied } = await pool.query(
          `SELECT 1 FROM schedule s 
           JOIN events e ON e.id = s.event_id 
           WHERE s.volunteer_id = $1 AND e.event_date = $2::date`,
          [row.id, excludeDate]
        );
        if (isOccupied.length > 0) continue;
      }

      const { rows: dRows } = await pool.query(
        'SELECT d.name FROM departments d JOIN volunteers_departments vd ON vd.department_id = d.id WHERE vd.volunteer_id = $1',
        [row.id]
      );
      row.departments = dRows.map((dr: any) => dr.name);
      const { rows: rRows } = await pool.query(
        'SELECT r.id, r.name FROM roles r JOIN volunteer_roles vr ON vr.role_id = r.id WHERE vr.volunteer_id = $1',
        [row.id]
      );
      row.assigned_roles = rRows.map((rr: any) => rr.name);
      // Mesmo formato da listagem admin — necessário para filtros na UI (ex.: edição de evento por função)
      row.role_ids = rRows.map((rr: any) => Number(rr.id));
      filteredRows.push(row);
    }

    res.json(filteredRows);
  } else {
    const roleId = req.query.role_id ? Number(req.query.role_id) : null;
    const excludeDate = req.query.exclude_date as string;
    const excludeEventId = req.query.exclude_event_id ? Number(req.query.exclude_event_id) : null;
    const excludeEventValid =
      excludeEventId != null && Number.isFinite(excludeEventId) && excludeEventId > 0;

    const { rows } = await pool.query(
      `
      SELECT v.*, ch.name AS church_name,
        COALESCE(array_remove(array_agg(DISTINCT d.name), NULL), '{}') AS departments,
        COALESCE(array_remove(array_agg(DISTINCT r.name), NULL), '{}') AS assigned_roles,
        COALESCE(array_remove(array_agg(DISTINCT r.id), NULL), '{}') AS role_ids
      FROM volunteers v
      LEFT JOIN churches ch ON ch.id = v.church_id
      LEFT JOIN volunteers_departments vd ON vd.volunteer_id = v.id
      LEFT JOIN departments d ON d.id = vd.department_id
      LEFT JOIN volunteer_roles vr ON vr.volunteer_id = v.id
      LEFT JOIN roles r ON r.id = vr.role_id
      WHERE ($1::boolean IS TRUE OR v.church_id = $2) 
        AND v.role != 'super_admin'
        AND ($3::integer IS NULL OR EXISTS (SELECT 1 FROM volunteer_roles vr2 WHERE vr2.volunteer_id = v.id AND vr2.role_id = $3))
        AND (
          $5::integer IS NULL
          OR NOT EXISTS (
            SELECT 1 FROM schedule s
            WHERE s.volunteer_id = v.id AND s.event_id = $5
            AND ($3::integer IS NULL OR s.role_id = $3)
          )
        )
        AND (
          $4::text IS NULL
          OR $5::integer IS NOT NULL
          OR NOT EXISTS (
            SELECT 1 FROM schedule s
            JOIN events e ON e.id = s.event_id
            WHERE s.volunteer_id = v.id AND e.event_date = $4::date
          )
        )
      GROUP BY v.id, ch.name
      ORDER BY CASE WHEN v.status = 'pending' THEN 0 ELSE 1 END, v.name
      `,
      [
        isSuper,
        u.church_id,
        roleId,
        excludeEventValid ? null : excludeDate,
        excludeEventValid ? excludeEventId : null,
      ]
    );
    res.json(rows);
  }
});

/** Disponibilidade semanal + escalas já confirmadas (mesma igreja que o usuário; super_admin liberado). */
router.get('/volunteers/:volunteerId/availability-overview', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const vid = Number(req.params.volunteerId);
    if (!Number.isFinite(vid) || vid < 1 || !Number.isInteger(vid)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const u = req.user!;
    const { rows: volRows } = await pool.query('SELECT church_id FROM volunteers WHERE id = $1', [vid]);
    if (!volRows[0]) {
      res.status(404).json({ error: 'Voluntário não encontrado' });
      return;
    }
    const targetChurch = volRows[0].church_id;
    if (!isSuperAdmin(u.role)) {
      if (
        targetChurch == null ||
        u.church_id == null ||
        Number(targetChurch) !== Number(u.church_id)
      ) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
    }
    const data = await scheduleService.getVolunteerAvailabilityOverview(vid);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/volunteers/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const u = req.user!;
    const { rows } = await pool.query(
      `SELECT v.*, ch.name AS church_name
       FROM volunteers v
       LEFT JOIN churches ch ON ch.id = v.church_id
       WHERE v.id = $1`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      res.status(404).json(null);
      return;
    }

    // Fetch departments
    const { rows: deptRows } = await pool.query(
      `SELECT d.* FROM departments d
       JOIN volunteers_departments vd ON vd.department_id = d.id
       WHERE vd.volunteer_id = $1`,
      [id]
    );
    row.departments = deptRows.map((r: any) => r.name);

    // Fetch roles
    const { rows: roleRows } = await pool.query(
      `SELECT r.id, r.name, d2.name AS department_name, r.department_id
       FROM roles r
       JOIN volunteer_roles vr ON vr.role_id = r.id
       JOIN departments d2 ON d2.id = r.department_id
       WHERE vr.volunteer_id = $1`,
      [id]
    );
    row.roles = roleRows;
    const ok =
      isSuperAdmin(u.role) ||
      u.id === id ||
      (u.role === 'admin' && row.church_id != null && row.church_id === u.church_id);
    if (!ok && u.role === 'lider') {
      if (!(await liderCanAccessVolunteer(id, req))) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
    } else if (!ok) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    res.json(row);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/me/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const u = req.user!;
    const { rows } = await pool.query(
      `SELECT v.id, v.name, v.email, v.role, v.status, v.church_id, v.phone_ddd, v.phone_number,
              v.satisfacao_resp, ch.name AS church_name
       FROM volunteers v
       LEFT JOIN churches ch ON ch.id = v.church_id
       WHERE v.id = $1`,
      [u.id]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    const { rows: deptRows } = await pool.query(
      `SELECT d.name FROM departments d
       JOIN volunteers_departments vd ON vd.department_id = d.id
       WHERE vd.volunteer_id = $1 ORDER BY d.name`,
      [u.id]
    );
    res.json({
      ...authService.publicUserFromRow(rows[0]),
      phone_ddd: rows[0].phone_ddd,
      phone_number: rows[0].phone_number,
      church_name: rows[0].church_name,
      departments: deptRows.map((r: { name: string }) => r.name),
      satisfacao_resp: Number(rows[0].satisfacao_resp ?? 0),
    });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/me/profile', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const u = req.user!;
    const { name, email, phone_ddd, phone_number, password } = req.body;
    if (!name?.trim() || !email?.trim()) {
      res.status(400).json({ error: 'Nome e e-mail são obrigatórios' });
      return;
    }

    let passwordHash: string | null = null;
    if (password && String(password).trim()) {
      assertPassword(String(password));
      const bcrypt = await import('bcrypt');
      passwordHash = await bcrypt.hash(String(password), 10);
    }

    if (passwordHash) {
      await pool.query(
        `UPDATE volunteers SET name=$1, email=$2, phone_ddd=$3, phone_number=$4, password_hash=$5
         WHERE id=$6`,
        [
          String(name).trim(),
          String(email).trim(),
          phone_ddd || null,
          phone_number || null,
          passwordHash,
          u.id,
        ]
      );
    } else {
      await pool.query(
        `UPDATE volunteers SET name=$1, email=$2, phone_ddd=$3, phone_number=$4 WHERE id=$5`,
        [
          String(name).trim(),
          String(email).trim(),
          phone_ddd || null,
          phone_number || null,
          u.id,
        ]
      );
    }

    const { rows } = await pool.query('SELECT * FROM volunteers WHERE id = $1', [u.id]);
    res.json(authService.publicUserFromRow(rows[0]));
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/me/satisfaction-status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const data = await satisfactionService.getSatisfactionStatus(req.user!.id);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/me/satisfaction', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const score = Number(req.body.score);
    const data = await satisfactionService.submitSatisfaction(req.user!.id, score);
    res.json(data);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/volunteers/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    const u = req.user!;
    const { rows: cur } = await pool.query('SELECT * FROM volunteers WHERE id = $1', [id]);
    if (!cur[0]) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }

    if (u.role === 'lider') {
      // Lider can edit volunteers in their departments, but only basic info
      await assertVolunteerInUserScope(id, req);
      const { name, email, active, status, phone_ddd, phone_number } = req.body;
      const { rows } = await pool.query(
        'UPDATE volunteers SET name=$1, email=$2, active=COALESCE($3, active), status=COALESCE($4, status), phone_ddd=COALESCE($5, phone_ddd), phone_number=COALESCE($6, phone_number) WHERE id=$7 RETURNING *',
        [name, email, active, status, phone_ddd, phone_number, id]
      );
      res.json(rows[0]);
      return;
    }

    if (!isSuperAdmin(u.role)) {
      if (cur[0].church_id !== u.church_id || u.role !== 'admin') {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
    }
    const { name, email, active, status, church_id, role } = req.body;
    const nextRole = role != null && role !== '' ? String(role) : cur[0].role;
    if (nextRole === 'super_admin' && !isSuperAdmin(u.role)) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const resolvedChurch =
      nextRole === 'super_admin'
        ? null
        : church_id != null && church_id !== ''
          ? Number(church_id)
          : cur[0].church_id;
    if (
      !isSuperAdmin(u.role) &&
      u.role === 'admin' &&
      resolvedChurch != null &&
      Number(resolvedChurch) !== u.church_id
    ) {
      res.status(403).json({ error: 'Administrador de igreja não pode mover usuários para outra igreja' });
      return;
    }
    const { rows } = await pool.query(
      'UPDATE volunteers SET name=$1, email=$2, active=$3, status=$4, church_id=$5, role=$6 WHERE id=$7 RETURNING *',
      [name, email, active, status, resolvedChurch, nextRole, id]
    );
    res.json(authService.publicUserFromRow(rows[0]));
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/volunteers/:id/status', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await assertVolunteerInUserScope(id, req);
    const { status, church_id } = req.body;
    const result = await authService.updateVolunteerStatus(id, status, church_id);
    res.json(result);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== EVENTS =====
router.get('/events', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  const isSuper = isSuperAdmin(u.role);
  const { start_date, end_date } = req.query;

  let query = `
    SELECT e.*, c.name AS church_name FROM events e
    LEFT JOIN churches c ON c.id = e.church_id
    WHERE ($1::boolean IS TRUE OR e.church_id = $2)
  `;
  const params: any[] = [isSuper, u.church_id];

  if (start_date && end_date) {
    query += ` AND e.event_date >= $3::date AND e.event_date <= $4::date`;
    params.push(start_date, end_date);
  }

  query += ` ORDER BY e.event_date ASC, e.event_time ASC`;

  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.post('/events', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const u = req.user!;
    const { 
      name, event_date, event_time, church_id, address, description, 
      is_recurring, recurrence_type, recurrence_interval, recurrence_count,
      assignments
    } = req.body;

    let cid: number;
    if (isSuperAdmin(u.role)) {
      cid = Number(church_id);
      if (!cid) return res.status(400).json({ error: 'church_id é obrigatório' });
    } else {
      cid = u.church_id!;
    }

    // Início da transação para criação atômica do evento e escalas
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO events (
          name, event_date, event_time, church_id, address, description, 
          is_recurring, recurrence_type, recurrence_interval, recurrence_count
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [
          name, event_date, event_time, cid, address, description, 
          is_recurring || false, recurrence_type, recurrence_interval, recurrence_count
        ]
      );
      const firstEvent = rows[0];
      
      console.log('--- POST /events CREATE ---');
      console.log('Event ID:', firstEvent.id);
      console.log('Assignments payload:', JSON.stringify(assignments, null, 2));

      if (assignments && Array.isArray(assignments)) {
        await validateAssignmentsForChurch(client, cid, assignments);
        for (const ass of assignments) {
          if (ass.role_id) {
            console.log('Processing assignment:', ass);
            await client.query(
              'INSERT INTO event_required_roles (event_id, role_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (event_id, role_id) DO NOTHING',
              [firstEvent.id, Number(ass.role_id), 1]
            );
            
            await client.query(
              'INSERT INTO schedule (event_id, volunteer_id, role_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, volunteer_id, role_id) DO NOTHING',
              [
                firstEvent.id, 
                ass.volunteer_id && ass.volunteer_id !== '' && ass.volunteer_id !== 'null' ? Number(ass.volunteer_id) : null,
                Number(ass.role_id), 
                ass.status || 'pendente'
              ]
            );
          }
        }
      }

      if (is_recurring) {
        const parsedCount = Number(recurrence_count);
        const count = Math.min(Math.max(Number.isFinite(parsedCount) ? parsedCount : 12, 2), 52);
        const interval = Math.max(Number(recurrence_interval) || 1, 1);
        const [year, month, day] = event_date.split('-').map(Number);
        let lastDate = new Date(year, month - 1, day);

        for (let i = 1; i < count; i++) {
          if (recurrence_type === 'daily') {
            lastDate.setDate(lastDate.getDate() + interval);
          } else if (recurrence_type === 'weekly') {
            lastDate.setDate(lastDate.getDate() + (7 * interval));
          } else if (recurrence_type === 'monthly') {
            lastDate.setMonth(lastDate.getMonth() + interval);
          } else if (recurrence_type === 'custom') {
            lastDate.setDate(lastDate.getDate() + interval);
          } else {
            break;
          }

          const formattedDate = lastDate.getFullYear() + '-' + 
            String(lastDate.getMonth() + 1).padStart(2, '0') + '-' + 
            String(lastDate.getDate()).padStart(2, '0');

          const { rows: recurringRows } = await client.query(
            `INSERT INTO events (name, event_date, event_time, church_id, address, description, is_recurring, parent_event_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [name, formattedDate, event_time, cid, address, description, false, firstEvent.id]
          );
          const newEventId = recurringRows[0].id;

          if (assignments && Array.isArray(assignments)) {
            for (const ass of assignments) {
              if (ass.role_id) {
                await client.query(
                  'INSERT INTO event_required_roles (event_id, role_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (event_id, role_id) DO NOTHING',
                  [newEventId, Number(ass.role_id), 1]
                );
                
                await client.query(
                  'INSERT INTO schedule (event_id, volunteer_id, role_id, status) VALUES ($1, $2, $3, $4) ON CONFLICT (event_id, volunteer_id, role_id) DO NOTHING',
                  [
                    newEventId, 
                    ass.volunteer_id && ass.volunteer_id !== '' && ass.volunteer_id !== 'null' ? Number(ass.volunteer_id) : null,
                    Number(ass.role_id), 
                    ass.status || 'pendente'
                  ]
                );
              }
            }
          }
        }
      }

      await client.query('COMMIT');
      notificationService
        .notifyEventCreated(
          cid,
          firstEvent.id,
          firstEvent.name,
          String(firstEvent.event_date).slice(0, 10)
        )
        .catch(() => {});
      res.json(firstEvent);
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/events/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const eid = Number(req.params.id);
    await assertEventInUserScope(eid, req);
    const { name, event_date, event_time, address, description, update_scope } = req.body;
    
    // Buscar o evento atual para saber se tem parent_event_id
    const { rows: currentEvent } = await pool.query('SELECT parent_event_id, event_date FROM events WHERE id = $1', [eid]);
    const event = currentEvent[0];

    // Início da transação para garantir que a atualização das escalas seja atômica
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let targetEventIds: number[] = [eid];

      if (update_scope === 'following') {
        const parentId = event.parent_event_id || eid;
        await client.query(
          `UPDATE events SET name=$1, event_time=$2, address=$3, description=$4 
           WHERE (id = $5 OR parent_event_id = $5)`,
          [name, event_time, address, description, parentId]
        );
        const { rows: seriesRows } = await client.query(
          `SELECT id FROM events 
           WHERE (id = $1 OR parent_event_id = $1)`,
          [parentId]
        );
        targetEventIds = seriesRows.map(r => Number(r.id)).filter(Boolean);
      } else {
        await client.query(
          'UPDATE events SET name=$1, event_date=$2, event_time=$3, address=$4, description=$5 WHERE id=$6',
          [name, event_date, event_time, address, description, eid]
        );
      }

      const { assignments } = req.body;
      if (assignments && Array.isArray(assignments)) {
        const { rows: eventChurchRows } = await client.query('SELECT church_id FROM events WHERE id = $1', [eid]);
        const eventChurchId = Number(eventChurchRows[0]?.church_id);
        if (!eventChurchId) {
          throw new Error('Evento inválido para atualização de assignments');
        }
        await validateAssignmentsForChurch(client, eventChurchId, assignments);
        for (const eventId of targetEventIds) {
          await client.query('DELETE FROM schedule WHERE event_id = $1', [eventId]);
          await client.query('DELETE FROM event_required_roles WHERE event_id = $1', [eventId]);

          for (const ass of assignments) {
            if (ass.role_id) {
              await client.query(
                'INSERT INTO event_required_roles (event_id, role_id, quantity) VALUES ($1, $2, $3) ON CONFLICT (event_id, role_id) DO NOTHING',
                [eventId, Number(ass.role_id), 1]
              );

              await client.query(
                'INSERT INTO schedule (event_id, volunteer_id, role_id, status) VALUES ($1, $2, $3, $4)',
                [
                  eventId,
                  ass.volunteer_id && ass.volunteer_id !== '' && ass.volunteer_id !== 'null' ? Number(ass.volunteer_id) : null,
                  Number(ass.role_id),
                  ass.status || 'pendente'
                ]
              );
            }
          }
        }
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/events/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const eid = Number(req.params.id);
    await assertEventInUserScope(eid, req);
    await pool.query('DELETE FROM events WHERE id = $1', [eid]);
    res.json({ ok: true });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== EVENT REQUIRED ROLES =====
router.get('/events/:id/required-roles', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const eid = Number(req.params.id);
    await assertEventInUserScope(eid, req);
    const { rows } = await pool.query(
      `SELECT err.*, r.name FROM event_required_roles err
       JOIN roles r ON r.id = err.role_id
       WHERE err.event_id = $1 ORDER BY r.name`,
      [eid]
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/events/:id/required-roles', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const eid = Number(req.params.id);
    const { role_id, quantity } = req.body;
    await assertEventInUserScope(eid, req);
    
    const { rows } = await pool.query(
      `INSERT INTO event_required_roles (event_id, role_id, quantity)
       VALUES ($1, $2, $3)
       ON CONFLICT (event_id, role_id) DO UPDATE SET quantity = $3
       RETURNING *`,
      [eid, Number(role_id), Number(quantity) || 1]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/events/:id/required-roles/:roleId', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const eid = Number(req.params.id);
    const rid = Number(req.params.roleId);
    await assertEventInUserScope(eid, req);
    await pool.query('DELETE FROM event_required_roles WHERE event_id = $1 AND role_id = $2', [eid, rid]);
    res.json({ ok: true });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== SCHEDULE =====
router.get('/schedule/event/:eventId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await assertEventInUserScope(Number(req.params.eventId), req);
    const rows = await scheduleService.getScheduleByEvent(Number(req.params.eventId));
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.get('/schedule/my', authMiddleware, async (req: AuthRequest, res) => {
  const rows = await scheduleService.getMySchedule(req.user!.id);
  res.json(rows);
});

router.get('/schedule/volunteer/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.id);
    if (!Number.isFinite(volunteerId) || volunteerId < 1 || !Number.isInteger(volunteerId)) {
      res.status(400).json({ error: 'ID de voluntário inválido' });
      return;
    }
    await assertVolunteerInUserScope(volunteerId, req);
    const rows = await scheduleService.getMySchedule(volunteerId);
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

/** Escalas elegíveis para troca: só `schedule.id` com participação confirmada (para o select da solicitação). */
router.get('/schedule/for-swap/:volunteerId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.volunteerId);
    if (!Number.isFinite(volunteerId) || volunteerId < 1 || !Number.isInteger(volunteerId)) {
      res.status(400).json({ error: 'ID de voluntário inválido' });
      return;
    }
    const u = req.user!;
    if (u.role === 'voluntario' && volunteerId !== u.id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (u.role !== 'voluntario') {
      await assertVolunteerInUserScope(volunteerId, req);
    }
    const rows = await scheduleService.getMyScheduleEligibleForSwap(volunteerId);
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/schedule', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const { event_id, volunteer_id, role_id } = req.body;
    await assertEventInUserScope(Number(event_id), req);
    await assertVolunteerInUserScope(Number(volunteer_id), req);
    const { rows: ev } = await pool.query('SELECT church_id FROM events WHERE id = $1', [event_id]);
    const { rows: vo } = await pool.query('SELECT church_id FROM volunteers WHERE id = $1', [volunteer_id]);
    if (ev[0].church_id !== vo[0].church_id) {
      res.status(400).json({ error: 'Voluntário e evento devem ser da mesma igreja' });
      return;
    }
    const { rows: ro } = await pool.query(
      `SELECT d.church_id FROM roles r JOIN departments d ON d.id = r.department_id WHERE r.id = $1`,
      [role_id]
    );
    if (!ro[0] || ro[0].church_id !== ev[0].church_id) {
      res.status(400).json({ error: 'Função incompatível com a igreja do evento' });
      return;
    }
    const item = await scheduleService.addToSchedule(event_id, volunteer_id, role_id);
    if (item?.id) {
      const { rows: meta } = await pool.query(
        `
        SELECT e.name AS event_name, e.event_date, e.church_id, r.name AS role_name
        FROM schedule s
        JOIN events e ON e.id = s.event_id
        LEFT JOIN roles r ON r.id = s.role_id
        WHERE s.id = $1
        `,
        [item.id]
      );
      if (meta[0]) {
        notificationService
          .notifyScheduleAssigned(
            volunteer_id,
            item.id,
            meta[0].event_name,
            meta[0].role_name || 'Função',
            meta[0].church_id,
            String(meta[0].event_date).slice(0, 10)
          )
          .catch(() => {});
      }
    }
    res.json(item);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/schedule/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    await assertScheduleInUserScope(Number(req.params.id), req);
    await scheduleService.removeFromSchedule(Number(req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/schedule/:id/confirm', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const sid = Number(req.params.id);
    const u = req.user!;
    const { rows } = await pool.query(
      `SELECT s.*, e.church_id FROM schedule s JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
      [sid]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    const row = rows[0];
    if (u.role === 'voluntario' && row.volunteer_id !== u.id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (isSuperAdmin(u.role)) {
      /* ok */
    } else if (u.role === 'admin' || u.role === 'lider') {
      if (row.church_id !== u.church_id) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
    } else if (u.role === 'voluntario') {
      /* já validado */
    } else {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const item = await scheduleService.confirmSchedule(sid);
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/schedule/:id/same-day-pending', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const sid = Number(req.params.id);
    if (!Number.isFinite(sid) || sid < 1 || !Number.isInteger(sid)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const u = req.user!;
    const { rows } = await pool.query(
      `SELECT s.volunteer_id, e.church_id FROM schedule s JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
      [sid]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Escala não encontrada' });
      return;
    }
    const volunteerId =
      u.role === 'voluntario' ? u.id : Number(req.query.volunteer_id) || rows[0].volunteer_id;
    if (u.role === 'voluntario' && rows[0].volunteer_id !== u.id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (!isSuperAdmin(u.role) && u.role !== 'voluntario' && rows[0].church_id !== u.church_id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    const data = await scheduleService.getSameDayPendingConflicts(Number(volunteerId), sid);
    res.json(data);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.put('/schedule/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const sid = Number(req.params.id);
    if (!Number.isFinite(sid) || sid < 1 || !Number.isInteger(sid)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const status = req.body.status as 'confirmado' | 'recusado' | 'pendente';
    if (!['confirmado', 'recusado', 'pendente'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }

    const u = req.user!;
    const { rows } = await pool.query(
      `SELECT s.*, e.church_id FROM schedule s JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
      [sid]
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Não encontrado' });
      return;
    }
    const row = rows[0];
    const rowStatus = String(row.status ?? 'pendente').toLowerCase();
    const changingAwayFromConfirmed = rowStatus === 'confirmado' && status !== 'confirmado';
    const onlyGestaoCanUnlock =
      changingAwayFromConfirmed && (u.role === 'voluntario' || u.role === 'lider');
    if (onlyGestaoCanUnlock) {
      res.status(403).json({
        error:
          'Participação já confirmada. Altere na edição do evento (aba Funções) ou peça a um administrador.',
      });
      return;
    }
    if (u.role === 'voluntario' && row.volunteer_id !== u.id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (!isSuperAdmin(u.role) && (u.role === 'admin' || u.role === 'lider') && row.church_id !== u.church_id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    if (!['voluntario', 'admin', 'lider', 'super_admin'].includes(u.role)) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }

    const item = await scheduleService.updateScheduleStatus(sid, status);
    res.json(item);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/schedule/available/:eventId', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    await assertEventInUserScope(Number(req.params.eventId), req);
    const u = req.user!;
    let deptIds: number[] | undefined;
    if (u.role === 'lider') {
      const { rows: leaderDepts } = await pool.query(
        'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
        [u.id]
      );
      deptIds = leaderDepts.map((d: any) => d.department_id);
    }
    const roleId = req.query.role_id ? Number(req.query.role_id) : undefined;
    const vols = await scheduleService.getAvailableVolunteers(
      Number(req.params.eventId),
      deptIds,
      Number.isFinite(roleId) && roleId! > 0 ? roleId : undefined
    );
    res.json(vols);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== AVAILABILITY =====
router.get('/availability/:volunteerId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const vid = Number(req.params.volunteerId);
    const u = req.user!;
    if (u.id !== vid) {
      if (!isSuperAdmin(u.role) && u.role !== 'admin' && u.role !== 'lider') {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
      await assertVolunteerInUserScope(vid, req);
    }
    const { rows } = await pool.query('SELECT * FROM availability WHERE volunteer_id = $1', [vid]);
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/availability', authMiddleware, async (req: AuthRequest, res) => {
  await scheduleService.saveAvailability(req.user!.id, req.body.slots);
  res.json({ ok: true });
});

router.get('/availability/:volunteerId/unavailability', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const vid = Number(req.params.volunteerId);
    const u = req.user!;
    if (u.id !== vid) {
      if (!isSuperAdmin(u.role) && u.role !== 'admin' && u.role !== 'lider') {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
      await assertVolunteerInUserScope(vid, req);
    }
    const rows = await scheduleService.listUnavailability(vid);
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/availability/unavailability', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await scheduleService.createUnavailability(req.user!.id, req.body);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/availability/unavailability/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id < 1) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    const row = await scheduleService.deleteUnavailability(id, req.user!.id);
    if (!row) {
      res.status(404).json({ error: 'Registro não encontrado' });
      return;
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/availability/unavailability-series/:seriesId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const seriesId = String(req.params.seriesId || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seriesId)) {
      res.status(400).json({ error: 'seriesId inválido' });
      return;
    }
    await scheduleService.deleteUnavailabilitySeries(seriesId, req.user!.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== SWAP REQUESTS =====
router.get('/swaps', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  const rows = await approvalService.listSwaps(u.id, u.role, u.church_id);
  res.json(rows);
});

router.get('/swaps/candidates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const scheduleId = Number(req.query.schedule_id);
    const requesterId = req.query.requester_id ? Number(req.query.requester_id) : req.user!.id;
    if (!Number.isFinite(scheduleId) || scheduleId < 1 || !Number.isInteger(scheduleId)) {
      res.status(400).json({ error: 'schedule_id inválido ou obrigatório' });
      return;
    }
    if (!Number.isFinite(requesterId) || requesterId < 1 || !Number.isInteger(requesterId)) {
      res.status(400).json({ error: 'requester_id inválido' });
      return;
    }
    if (req.user!.role === 'voluntario' && requesterId !== req.user!.id) {
      res.status(403).json({ error: 'Voluntário só pode consultar para si mesmo' });
      return;
    }
    if (req.user!.role !== 'voluntario') {
      const { rows: sch } = await pool.query('SELECT event_id FROM schedule WHERE id = $1', [scheduleId]);
      if (!sch[0]) {
        res.status(404).json({ error: 'Escala não encontrada' });
        return;
      }
      await assertEventInUserScope(Number(sch[0].event_id), req);
    }

    const data = await approvalService.getSwapCandidates(scheduleId, requesterId);
    res.json(data);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/swaps', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { requester_id, target_id, schedule_id, message } = req.body;
    const sid = Number(schedule_id);
    const tid = Number(target_id);
    const rid = requester_id !== undefined && requester_id !== null && requester_id !== ''
      ? Number(requester_id)
      : req.user!.id;
    if (!Number.isFinite(sid) || sid < 1 || !Number.isInteger(sid)) {
      res.status(400).json({ error: 'schedule_id inválido' });
      return;
    }
    if (!Number.isFinite(tid) || tid < 1 || !Number.isInteger(tid)) {
      res.status(400).json({ error: 'target_id inválido' });
      return;
    }
    if (!Number.isFinite(rid) || rid < 1 || !Number.isInteger(rid)) {
      res.status(400).json({ error: 'requester_id inválido' });
      return;
    }
    const { rows: sch } = await pool.query(
      `SELECT s.*, e.church_id FROM schedule s JOIN events e ON e.id = s.event_id WHERE s.id = $1`,
      [sid]
    );
    if (!sch[0]) {
      res.status(404).json({ error: 'Escala não encontrada' });
      return;
    }
    await assertEventInUserScope(sch[0].event_id, req);
    const swap = await approvalService.requestSwap(rid, tid, sid, message, req.user!);
    const churchId = sch[0].church_id;
    const staff = await pool.query(
      `SELECT id FROM volunteers WHERE active = true AND status = 'active'
       AND role IN ('admin','lider') AND church_id = $1`,
      [churchId]
    );
    const recipients = [
      rid,
      tid,
      ...staff.rows.map((r: { id: number }) => r.id),
      req.user!.id,
    ];
    notificationService
      .notifySwapActivity(
        recipients,
        swap.id,
        'Nova solicitação de troca',
        'Aguardando aprovação do alvo e da gestão',
        churchId
      )
      .catch(() => {});
    waDispatch
      .dispatchWhatsAppNotification({
        type: 'swap',
        title: 'Nova solicitação de troca',
        body: 'Aguardando aprovação',
        linkPath: '/trocas',
        recipientIds: recipients,
        referenceType: 'swap',
        referenceId: swap.id,
      })
      .catch(() => {});
    res.json(swap);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/swaps/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await approvalService.cancelSwap(Number(req.params.id), req.user!);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/swaps/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const status = req.body.status as 'aprovado' | 'recusado';
    if (!['aprovado', 'recusado'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }
    const swap = await approvalService.reviewSwap(Number(req.params.id), status, req.user!);
    const { rows: swMeta } = await pool.query(
      `SELECT sr.requester_id, sr.target_id, e.church_id
       FROM swap_requests sr
       JOIN schedule s ON s.id = sr.schedule_id
       JOIN events e ON e.id = s.event_id
       WHERE sr.id = $1`,
      [req.params.id]
    );
    if (swMeta[0]) {
      const title =
        status === 'aprovado' ? 'Troca de escala aprovada' : 'Troca de escala recusada';
      notificationService
        .notifySwapActivity(
          [swMeta[0].requester_id, swMeta[0].target_id, req.user!.id],
          Number(req.params.id),
          title,
          status === 'aprovado' ? 'A escala foi atualizada' : 'Solicitação encerrada',
          swMeta[0].church_id
        )
        .catch(() => {});
      if (status === 'aprovado') {
        await pool.query(
          `UPDATE notifications SET reference_completed_at = NOW()
           WHERE reference_type = 'swap' AND reference_id = $1`,
          [req.params.id]
        );
        waDispatch
          .dispatchWhatsAppNotification({
            type: 'swap',
            title: 'Troca de escala confirmada',
            body: 'A escala foi atualizada com sucesso',
            linkPath: '/trocas',
            referenceType: 'swap',
            referenceId: Number(req.params.id),
            generalBroadcast: true,
          })
          .catch(() => {});
      }
      waDispatch
        .dispatchWhatsAppNotification({
          type: 'swap',
          title,
          body: status === 'aprovado' ? 'Troca aprovada' : 'Troca recusada',
          linkPath: '/trocas',
          recipientIds: [swMeta[0].requester_id, swMeta[0].target_id],
          referenceType: 'swap',
          referenceId: Number(req.params.id),
        })
        .catch(() => {});
    }
    res.json(swap);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/swaps/:id/target', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const targetId = Number(req.body.target_id);
    if (!Number.isFinite(targetId) || targetId < 1 || !Number.isInteger(targetId)) {
      res.status(400).json({ error: 'target_id inválido ou obrigatório' });
      return;
    }
    const swap = await approvalService.updateSwapTarget(Number(req.params.id), targetId, req.user!);
    res.json(swap);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== TASKS =====
const TASK_FLOW: Record<string, string[]> = {
  novo: ['fazendo'],
  fazendo: ['entregue'],
  entregue: [],
};

function canRequestTaskStatusTransition(current: string, next: string) {
  return (TASK_FLOW[current] || []).includes(next);
}

router.get('/tasks', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  let query = `
    SELECT t.*, v.name AS assigned_name, cb.name AS created_by_name, rsb.name AS requested_status_by_name
    FROM tasks t
    LEFT JOIN volunteers v ON v.id = t.assigned_to
    LEFT JOIN volunteers cb ON cb.id = t.created_by
    LEFT JOIN volunteers rsb ON rsb.id = t.requested_status_by
    WHERE
  `;
  const params: unknown[] = [];
  if (u.role === 'voluntario') {
    query += 't.church_id = $1 AND (t.assigned_to = $2 OR t.assigned_to IS NULL)';
    params.push(u.church_id, u.id);
  } else if (isSuperAdmin(u.role)) {
    query += 'TRUE';
  } else {
    query += 't.church_id = $1';
    params.push(u.church_id);
  }
  query += `
    ORDER BY
      CASE t.status WHEN 'novo' THEN 0 WHEN 'fazendo' THEN 1 ELSE 2 END,
      t.priority DESC,
      t.created_at DESC
  `;
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

router.post('/tasks', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const { title, description, assigned_to, priority, due_date, church_id } = req.body;
    const u = req.user!;
    let cid: number | null = null;
    if (isSuperAdmin(u.role)) {
      cid = church_id != null && church_id !== '' ? Number(church_id) : null;
      if (!cid) {
        res.status(400).json({ error: 'church_id é obrigatório para super administrador' });
        return;
      }
    } else {
      cid = u.church_id;
    }

    if (assigned_to) await assertVolunteerInUserScope(Number(assigned_to), req);
    const { rows } = await pool.query(
      `INSERT INTO tasks (title, description, assigned_to, created_by, priority, due_date, church_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'novo') RETURNING *`,
      [title, description, assigned_to || null, u.id, priority, due_date, cid]
    );
    const task = rows[0];
    if (assigned_to) {
      waDispatch
        .dispatchWhatsAppNotification({
          type: 'task_pending',
          title: 'Nova tarefa atribuída',
          body: title,
          linkPath: '/tarefas',
          recipientIds: [Number(assigned_to)],
          referenceType: 'task',
          referenceId: task.id,
        })
        .catch(() => {});
    } else {
      waDispatch
        .dispatchWhatsAppNotification({
          type: 'task_pending',
          title: 'Nova tarefa sem responsável',
          body: title,
          linkPath: '/tarefas',
          referenceType: 'task',
          referenceId: task.id,
          generalBroadcast: true,
        })
        .catch(() => {});
    }
    res.json(task);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/tasks/:id/assign-to-me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    const u = req.user!;
    if (u.role !== 'voluntario') {
      res.status(403).json({ error: 'Somente voluntário pode se autoatribuir' });
      return;
    }
    const { rows } = await pool.query('SELECT id, church_id, assigned_to FROM tasks WHERE id = $1', [tid]);
    const task = rows[0];
    if (!task) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    if (task.church_id !== u.church_id) {
      res.status(403).json({ error: 'Tarefa fora da sua igreja' });
      return;
    }
    if (task.assigned_to && Number(task.assigned_to) !== u.id) {
      res.status(400).json({ error: 'Tarefa já atribuída para outra pessoa' });
      return;
    }

    const { rows: updated } = await pool.query(
      `UPDATE tasks
       SET assigned_to = $2
       WHERE id = $1
       RETURNING *`,
      [tid, u.id]
    );
    res.json(updated[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/tasks/:id/status', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    const { status } = req.body;
    if (!['novo', 'fazendo', 'entregue'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }
    await assertTaskInUserScope(tid, req);
    const { rows } = await pool.query(
      `UPDATE tasks
       SET status = $2, requested_status = NULL, requested_status_by = NULL
       WHERE id = $1
       RETURNING *`,
      [tid, status]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/tasks/:id/request-status', authMiddleware, requireRole('voluntario'), async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    const { status } = req.body;
    if (!['novo', 'fazendo', 'entregue'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }
    const { rows } = await pool.query('SELECT * FROM tasks WHERE id = $1', [tid]);
    const task = rows[0];
    if (!task) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    if (task.assigned_to !== req.user!.id) {
      res.status(403).json({ error: 'Somente responsável pode solicitar mudança de status' });
      return;
    }
    if (!canRequestTaskStatusTransition(task.status, status)) {
      res.status(400).json({ error: `Transição inválida: ${task.status} -> ${status}` });
      return;
    }
    const { rows: updated } = await pool.query(
      `UPDATE tasks
       SET requested_status = $2, requested_status_by = $3
       WHERE id = $1
       RETURNING *`,
      [tid, status, req.user!.id]
    );
    res.json(updated[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.patch('/tasks/:id/approve-status', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    await assertTaskInUserScope(tid, req);
    const { rows } = await pool.query('SELECT status, requested_status FROM tasks WHERE id = $1', [tid]);
    const task = rows[0];
    if (!task) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    if (!task.requested_status) {
      res.status(400).json({ error: 'Tarefa não possui solicitação pendente' });
      return;
    }
    if (!canRequestTaskStatusTransition(task.status, task.requested_status)) {
      res.status(400).json({ error: 'Transição solicitada não é permitida' });
      return;
    }
    const { rows: updated } = await pool.query(
      `UPDATE tasks
       SET status = requested_status, requested_status = NULL, requested_status_by = NULL
       WHERE id = $1
       RETURNING *`,
      [tid]
    );
    res.json(updated[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/tasks/:id/reject-status', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    await assertTaskInUserScope(tid, req);
    const { rows: updated } = await pool.query(
      `UPDATE tasks
       SET requested_status = NULL, requested_status_by = NULL
       WHERE id = $1
       RETURNING *`,
      [tid]
    );
    res.json(updated[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.get('/tasks/overview', authMiddleware, requireRole('admin', 'lider', 'super_admin'), async (req: AuthRequest, res) => {
  try {
    const scope = await getReportScope(req);
    const p = scopeParams(scope);
    const { rows } = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE t.status = 'novo')::int AS novo,
        COUNT(*) FILTER (WHERE t.status = 'fazendo')::int AS fazendo,
        COUNT(*) FILTER (WHERE t.status = 'entregue')::int AS entregue,
        COUNT(*) FILTER (WHERE t.requested_status IS NOT NULL)::int AS pendentes_aprovacao
      FROM tasks t
      WHERE ($1::boolean IS TRUE OR t.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR t.assigned_to IS NULL
          OR EXISTS (
            SELECT 1 FROM volunteers_departments vd
            WHERE vd.volunteer_id = t.assigned_to AND vd.department_id = ANY($4::int[])
          )
        )
      `,
      p
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    const u = req.user!;
    if (u.role === 'admin' || u.role === 'lider') {
      await assertTaskInUserScope(tid, req);
    }
    const { rows } = await pool.query(
      `
      SELECT t.*, v.name AS assigned_name, cb.name AS created_by_name, rsb.name AS requested_status_by_name
      FROM tasks t
      LEFT JOIN volunteers v ON v.id = t.assigned_to
      LEFT JOIN volunteers cb ON cb.id = t.created_by
      LEFT JOIN volunteers rsb ON rsb.id = t.requested_status_by
      WHERE t.id = $1
      `,
      [tid]
    );
    const task = rows[0];
    if (!task) {
      res.status(404).json({ error: 'Tarefa não encontrada' });
      return;
    }
    if (u.role === 'voluntario') {
      const allowed = task.church_id === u.church_id && (task.assigned_to === u.id || task.assigned_to == null);
      if (!allowed) {
        res.status(403).json({ error: 'Acesso negado' });
        return;
      }
    }
    if (!isSuperAdmin(u.role) && u.role !== 'voluntario' && task.church_id !== u.church_id) {
      res.status(403).json({ error: 'Tarefa fora da sua igreja' });
      return;
    }
    res.json(task);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.put('/tasks/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const tid = Number(req.params.id);
    await assertTaskInUserScope(tid, req);
    const { title, description, priority, due_date, assigned_to, status } = req.body;

    if (assigned_to) await assertVolunteerInUserScope(Number(assigned_to), req);
    if (status && !['novo', 'fazendo', 'entregue'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }
    const { rows } = await pool.query(
      `
      UPDATE tasks
      SET
        title = COALESCE($2, title),
        description = COALESCE($3, description),
        priority = COALESCE($4, priority),
        due_date = $5,
        assigned_to = $6,
        status = COALESCE($7, status),
        requested_status = NULL,
        requested_status_by = NULL
      WHERE id = $1
      RETURNING *
      `,
      [
        tid,
        title ?? null,
        description ?? null,
        priority ?? null,
        due_date || null,
        assigned_to ? Number(assigned_to) : null,
        status ?? null,
      ]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/tasks/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    await assertTaskInUserScope(Number(req.params.id), req);
    await pool.query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== DEPARTMENTS =====
router.get('/departments', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  const isSuper = isSuperAdmin(u.role);

  if (u.role === 'lider') {
    const { rows: leaderDepts } = await pool.query(
      'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
      [u.id]
    );
    if (leaderDepts.length === 0) {
      return res.json([]);
    }
    const deptIds: number[] = leaderDepts.map((d: any) => d.department_id);
    const deptPlaceholders = deptIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `
      SELECT d.*, COUNT(vd.volunteer_id) AS member_count
      FROM departments d
      LEFT JOIN volunteers_departments vd ON vd.department_id = d.id
      WHERE d.id IN (${deptPlaceholders})
      GROUP BY d.id ORDER BY d.name
      `,
      deptIds
    );
    res.json(rows);
  } else if (u.role === 'admin') {
    const { rows } = await pool.query(
      `
      SELECT d.*, COUNT(vd.volunteer_id) AS member_count
      FROM departments d
      LEFT JOIN volunteers_departments vd ON vd.department_id = d.id
      WHERE d.church_id = $1
      GROUP BY d.id ORDER BY d.name
      `,
      [u.church_id]
    );
    // Enrich each department with leader info
    for (const dept of rows) {
      const { rows: leaders } = await pool.query(
        `SELECT v.id, v.name FROM volunteers_departments vd
         JOIN volunteers v ON v.id = vd.volunteer_id
         WHERE vd.department_id = $1 AND vd.is_leader = true
         ORDER BY v.name LIMIT 1`,
        [dept.id]
      );
      dept.leader_id = leaders[0]?.id || null;
      dept.leader_name = leaders[0]?.name || null;
    }
    res.json(rows);
  } else {
    // super_admin
    const { rows } = await pool.query(
      `
      SELECT d.*, ch.name AS church_name, COUNT(vd.volunteer_id) AS member_count
      FROM departments d
      LEFT JOIN volunteers_departments vd ON vd.department_id = d.id
      LEFT JOIN churches ch ON ch.id = d.church_id
      GROUP BY d.id, ch.name ORDER BY ch.name, d.name
      `
    );
    // Enrich each department with leader info
    for (const dept of rows) {
      const { rows: leaders } = await pool.query(
        `SELECT v.id, v.name FROM volunteers_departments vd
         JOIN volunteers v ON v.id = vd.volunteer_id
         WHERE vd.department_id = $1 AND vd.is_leader = true
         ORDER BY v.name LIMIT 1`,
        [dept.id]
      );
      dept.leader_id = leaders[0]?.id || null;
      dept.leader_name = leaders[0]?.name || null;
    }
    res.json(rows);
  }
});

router.post('/departments', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const u = req.user!;
    const { name, icon, church_id } = req.body;
    let cid: number;
    if (isSuperAdmin(u.role)) {
      cid = Number(church_id);
      if (!cid) {
        res.status(400).json({ error: 'church_id é obrigatório' });
        return;
      }
    } else {
      cid = u.church_id!;
    }
    const { rows } = await pool.query(
      'INSERT INTO departments (name, icon, church_id) VALUES ($1,$2,$3) RETURNING *',
      [name, icon, cid]
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.put('/departments/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const departmentId = Number(req.params.id);
    const { name, icon } = req.body;
    
    const { rows: depRows } = await pool.query('SELECT church_id FROM departments WHERE id = $1', [departmentId]);
    if (!depRows[0]) {
      res.status(404).json({ error: 'Departamento não encontrado' });
      return;
    }
    
    const u = req.user!;
    if (!isSuperAdmin(u.role) && u.church_id !== depRows[0].church_id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    
    const { rows } = await pool.query(
      'UPDATE departments SET name=$1, icon=$2 WHERE id=$3 RETURNING *',
      [name, icon, departmentId]
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/departments/:id', authMiddleware, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const departmentId = Number(req.params.id);
    
    const { rows: depRows } = await pool.query('SELECT church_id FROM departments WHERE id = $1', [departmentId]);
    if (!depRows[0]) {
      res.status(404).json({ error: 'Departamento não encontrado' });
      return;
    }
    
    const u = req.user!;
    if (!isSuperAdmin(u.role) && u.church_id !== depRows[0].church_id) {
      res.status(403).json({ error: 'Acesso negado' });
      return;
    }
    
    // Delete associated roles first
    await pool.query('DELETE FROM volunteer_roles WHERE role_id IN (SELECT id FROM roles WHERE department_id = $1)', [departmentId]);
    await pool.query('DELETE FROM roles WHERE department_id = $1', [departmentId]);
    await pool.query('DELETE FROM volunteers_departments WHERE department_id = $1', [departmentId]);
    await pool.query('DELETE FROM departments WHERE id = $1', [departmentId]);
    
    res.status(204).send();
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/departments/:id/leaders', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const departmentId = Number(req.params.id);
    await assertDepartmentInUserScope(departmentId, req);

    const { rows } = await pool.query(
      `SELECT v.id, v.name, v.email, v.role
       FROM volunteers_departments vd
       JOIN volunteers v ON v.id = vd.volunteer_id
       WHERE vd.department_id = $1 AND vd.is_leader = true`,
      [departmentId]
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/departments/:id/leaders', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const departmentId = Number(req.params.id);
    const { volunteer_id } = req.body;
    if (!volunteer_id) return res.status(400).json({ error: 'volunteer_id é obrigatório' });

    await assertCanManageDepartment(departmentId, req);
    await assertDepartmentInUserScope(departmentId, req);

    const { rows: deptRows } = await pool.query('SELECT church_id FROM departments WHERE id = $1', [departmentId]);
    if (!deptRows[0]) return res.status(404).json({ error: 'Departamento não encontrado' });

    const { rows: volunteerRows } = await pool.query('SELECT church_id FROM volunteers WHERE id = $1', [Number(volunteer_id)]);
    if (!volunteerRows[0]) return res.status(404).json({ error: 'Voluntário não encontrado' });

    if (deptRows[0].church_id !== volunteerRows[0].church_id) {
      return res.status(400).json({ error: 'O voluntário deve pertencer à mesma igreja do departamento' });
    }

    await pool.query(
      `INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
       VALUES ($1, $2, true)
       ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = true`,
      [Number(volunteer_id), departmentId]
    );

    res.status(201).json({ volunteer_id: Number(volunteer_id), department_id: departmentId, is_leader: true });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/departments/:id/leaders/:volunteerId', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const departmentId = Number(req.params.id);
    const volunteerId = Number(req.params.volunteerId);

    await assertCanManageDepartment(departmentId, req);
    await assertDepartmentInUserScope(departmentId, req);

    await pool.query(
      'UPDATE volunteers_departments SET is_leader = false WHERE department_id = $1 AND volunteer_id = $2',
      [departmentId, volunteerId]
    );

    res.status(204).send();
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

/** Vincula voluntário a um ministério como membro (não líder). */
router.post('/volunteers/:id/departments', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.id);
    const departmentId = Number(req.body.department_id);
    if (!Number.isFinite(volunteerId) || !Number.isFinite(departmentId)) {
      res.status(400).json({ error: 'IDs inválidos' });
      return;
    }

    await assertVolunteerInUserScope(volunteerId, req);
    await assertDepartmentInUserScope(departmentId, req);

    const { rows: deptRows } = await pool.query('SELECT church_id FROM departments WHERE id = $1', [
      departmentId,
    ]);
    if (!deptRows[0]) {
      res.status(404).json({ error: 'Departamento não encontrado' });
      return;
    }

    const { rows: volunteerRows } = await pool.query(
      'SELECT church_id FROM volunteers WHERE id = $1',
      [volunteerId]
    );
    if (!volunteerRows[0]) {
      res.status(404).json({ error: 'Voluntário não encontrado' });
      return;
    }
    if (deptRows[0].church_id !== volunteerRows[0].church_id) {
      res.status(400).json({ error: 'O voluntário deve pertencer à mesma igreja do ministério' });
      return;
    }

    await pool.query(
      `INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
       VALUES ($1, $2, false)
       ON CONFLICT (volunteer_id, department_id) DO NOTHING`,
      [volunteerId, departmentId]
    );

    res.status(201).json({ volunteer_id: volunteerId, department_id: departmentId });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// Remove volunteer from department entirely
router.delete('/volunteers/:id/departments/:deptId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.id);
    const deptId = Number(req.params.deptId);

    await assertDepartmentInUserScope(deptId, req);
    await assertVolunteerInUserScope(volunteerId, req);

    await pool.query(
      'DELETE FROM volunteers_departments WHERE volunteer_id = $1 AND department_id = $2',
      [volunteerId, deptId]
    );

    res.status(204).send();
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== ME =====
router.get('/me/departments', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  const { rows } = await pool.query(
    `SELECT d.* FROM departments d
     INNER JOIN volunteers_departments vd ON vd.department_id = d.id
     WHERE vd.volunteer_id = $1 AND vd.is_leader = true
     ORDER BY d.name`,
    [u.id]
  );
  res.json(rows);
});

// ===== CHURCHES =====
router.get('/churches', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM churches ORDER BY name');
  res.json(rows);
});

router.post('/churches', authMiddleware, requireRole('super_admin'), async (req, res) => {
  try {
    const { name, address } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO churches (name, address) VALUES ($1,$2) RETURNING *',
      [name, address]
    );
    res.json(rows[0]);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== ROLES (funções em departamentos) =====
router.get('/roles', authMiddleware, async (req: AuthRequest, res) => {
  const u = req.user!;
  const isSuper = isSuperAdmin(u.role);
  const requestedChurchId = req.query.church_id ? Number(req.query.church_id) : null;

  if (u.role === 'lider') {
    const { rows: leaderDepts } = await pool.query(
      'SELECT department_id FROM volunteers_departments WHERE volunteer_id = $1 AND is_leader = true',
      [u.id]
    );
    if (leaderDepts.length === 0) {
      return res.json([]);
    }
    const deptIds: number[] = leaderDepts.map((d: any) => d.department_id);
    const rolePlaceholders = deptIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `
      SELECT r.*, d.name AS department_name FROM roles r
      LEFT JOIN departments d ON d.id = r.department_id
      WHERE d.id IN (${rolePlaceholders})
      ORDER BY d.name, r.name
      `,
      deptIds
    );
    res.json(rows);
  } else {
    let rows: any[] = [];
    if (isSuper && requestedChurchId) {
      const result = await pool.query(
        `
        SELECT r.*, d.name AS department_name FROM roles r
        LEFT JOIN departments d ON d.id = r.department_id
        WHERE d.church_id = $1
        ORDER BY d.name, r.name
        `,
        [requestedChurchId]
      );
      rows = result.rows;
    } else {
      const result = await pool.query(
        `
        SELECT r.*, d.name AS department_name FROM roles r
        LEFT JOIN departments d ON d.id = r.department_id
        WHERE ($1::boolean IS TRUE OR d.church_id = $2)
        ORDER BY d.name, r.name
        `,
        [isSuper, u.church_id]
      );
      rows = result.rows;
    }
    res.json(rows);
  }
});

router.post('/roles', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const { name, department_id } = req.body;
    if (!name || !department_id) {
      return res.status(400).json({ error: 'Nome e department_id são obrigatórios' });
    }
    await assertCanManageDepartment(Number(department_id), req);
    const { rows } = await pool.query(
      'INSERT INTO roles (name, department_id) VALUES ($1,$2) RETURNING *',
      [name, Number(department_id)]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/roles/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const roleId = Number(req.params.id);
    const { rows: roleRows } = await pool.query('SELECT department_id FROM roles WHERE id = $1', [roleId]);
    if (!roleRows[0]) return res.status(404).json({ error: 'Função não encontrada' });
    await assertCanManageDepartment(roleRows[0].department_id, req);

    const { name, department_id } = req.body;
    const updatedDepartmentId = department_id ? Number(department_id) : roleRows[0].department_id;
    if (department_id) {
      await assertCanManageDepartment(updatedDepartmentId, req);
    }

    const { rows } = await pool.query(
      'UPDATE roles SET name = COALESCE($1, name), department_id = $2 WHERE id = $3 RETURNING *',
      [name, updatedDepartmentId, roleId]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/roles/:id', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const roleId = Number(req.params.id);
    const { rows: roleRows } = await pool.query('SELECT department_id FROM roles WHERE id = $1', [roleId]);
    if (!roleRows[0]) return res.status(404).json({ error: 'Função não encontrada' });
    await assertCanManageDepartment(roleRows[0].department_id, req);

    await pool.query('DELETE FROM roles WHERE id = $1', [roleId]);
    res.status(204).send();
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== VOLUNTEER ROLES =====
router.get('/volunteers/:id/roles', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.id);
    await assertVolunteerInUserScope(volunteerId, req);

    const { rows: volunteerRows } = await pool.query('SELECT role FROM volunteers WHERE id = $1', [volunteerId]);
    if (!volunteerRows[0]) return res.status(404).json({ error: 'Voluntário não encontrado' });
    if (volunteerRows[0].role === 'admin' || volunteerRows[0].role === 'super_admin') {
      return res.status(200).json([]);
    }

    const { rows } = await pool.query(
      `
      SELECT r.* FROM volunteer_roles vr
      JOIN roles r ON r.id = vr.role_id
      WHERE vr.volunteer_id = $1
      `,
      [volunteerId]
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.post('/volunteers/:id/roles', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.id);
    const { role_id } = req.body;
    if (!role_id) return res.status(400).json({ error: 'role_id é obrigatório' });
    await assertVolunteerInUserScope(volunteerId, req);

    const { rows: volunteerRows } = await pool.query('SELECT role FROM volunteers WHERE id = $1', [volunteerId]);
    if (!volunteerRows[0]) return res.status(404).json({ error: 'Voluntário não encontrado' });
    if (volunteerRows[0].role === 'admin' || volunteerRows[0].role === 'super_admin') {
      return res.status(400).json({ error: 'Não é possível atribuir funções a administradores' });
    }

    const { rows: roleRows } = await pool.query(
      `SELECT r.department_id, d.church_id FROM roles r 
       JOIN departments d ON d.id = r.department_id 
       WHERE r.id = $1`, 
      [Number(role_id)]
    );
    if (!roleRows[0]) return res.status(404).json({ error: 'Função não encontrada' });
    
    // Check if volunteer and department belong to the same church
    const { rows: volChurchRows } = await pool.query('SELECT church_id FROM volunteers WHERE id = $1', [volunteerId]);
    if (volChurchRows[0]?.church_id !== roleRows[0].church_id) {
      return res.status(400).json({ error: 'O voluntário e a função devem pertencer à mesma igreja' });
    }

    await assertCanManageDepartment(roleRows[0].department_id, req);

    await pool.query('INSERT INTO volunteer_roles (volunteer_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [volunteerId, Number(role_id)]);
    res.status(201).json({ volunteer_id: volunteerId, role_id: Number(role_id) });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.delete('/volunteers/:id/roles/:roleId', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const volunteerId = Number(req.params.id);
    const roleId = Number(req.params.roleId);
    await assertVolunteerInUserScope(volunteerId, req);

    const { rows: volunteerRows } = await pool.query('SELECT role FROM volunteers WHERE id = $1', [volunteerId]);
    if (!volunteerRows[0]) return res.status(404).json({ error: 'Voluntário não encontrado' });
    if (volunteerRows[0].role === 'admin' || volunteerRows[0].role === 'super_admin') {
      return res.status(400).json({ error: 'Não é possível remover funções de administradores' });
    }

    const { rows: roleRows } = await pool.query('SELECT department_id FROM roles WHERE id = $1', [roleId]);
    if (!roleRows[0]) return res.status(404).json({ error: 'Função não encontrada' });
    await assertCanManageDepartment(roleRows[0].department_id, req);

    await pool.query('DELETE FROM volunteer_roles WHERE volunteer_id = $1 AND role_id = $2', [volunteerId, roleId]);
    res.status(204).send();
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

// ===== REPORTS =====

router.get('/reports/dashboard-stats', authMiddleware, requireRole('admin', 'lider', 'super_admin'), async (req: AuthRequest, res) => {
  try {
    const scope = await getReportScope(req);
    const p = scopeParams(scope);

    const volRes = await pool.query(
      `
      SELECT COUNT(*)::int AS count FROM volunteers v
      WHERE v.active = true AND v.role = 'voluntario'
        AND ($1::boolean IS TRUE OR v.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR EXISTS (
            SELECT 1 FROM volunteers_departments vd
            WHERE vd.volunteer_id = v.id AND vd.department_id = ANY($4::int[])
          )
        )
      `,
      p
    );
    const totalVolunteers = volRes.rows[0].count;

    const eventsRes = await pool.query(
      `
      SELECT COUNT(DISTINCT e.id)::int AS count FROM events e
      WHERE date_trunc('month', e.event_date) = date_trunc('month', CURRENT_DATE)
        AND ($1::boolean IS TRUE OR e.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR EXISTS (
            SELECT 1 FROM schedule s
            JOIN volunteers_departments vd ON vd.volunteer_id = s.volunteer_id
            WHERE s.event_id = e.id AND vd.department_id = ANY($4::int[])
          )
        )
      `,
      p
    );
    const eventsInMonth = eventsRes.rows[0].count;

    const schedRes = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total_schedules,
        COUNT(CASE WHEN s.status = 'confirmado' THEN 1 END)::int AS confirmed_schedules
      FROM schedule s
      JOIN events e ON e.id = s.event_id
      WHERE ($1::boolean IS TRUE OR e.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR EXISTS (
            SELECT 1 FROM volunteers_departments vd
            WHERE vd.volunteer_id = s.volunteer_id AND vd.department_id = ANY($4::int[])
          )
        )
      `,
      p
    );
    const totalSchedules = schedRes.rows[0].total_schedules;
    const confirmedSchedules = schedRes.rows[0].confirmed_schedules;
    const globalAttendanceRate =
      totalSchedules > 0
        ? ((confirmedSchedules / totalSchedules) * 100).toFixed(1)
        : 0;

    res.json({ totalVolunteers, eventsInMonth, totalSchedules, globalAttendanceRate });
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.get('/reports/checkin-timeline', authMiddleware, requireRole('admin', 'lider', 'super_admin'), async (req: AuthRequest, res) => {
  try {
    const scope = await getReportScope(req);
    const p = scopeParams(scope);
    const { rows } = await pool.query(
      `
      SELECT e.id, e.name, to_char(e.event_date, 'DD/MM') as event_date_formatted,
        COUNT(s.id)::int as scheduled,
        COUNT(CASE WHEN s.status = 'confirmado' THEN 1 END)::int as confirmed,
        COUNT(CASE WHEN s.status = 'recusado' THEN 1 END)::int as rejected
      FROM events e
      LEFT JOIN schedule s ON s.event_id = e.id
        AND (
          $3::boolean IS NOT TRUE
          OR EXISTS (
            SELECT 1 FROM volunteers_departments vd
            WHERE vd.volunteer_id = s.volunteer_id AND vd.department_id = ANY($4::int[])
          )
        )
      WHERE e.event_date <= CURRENT_DATE
        AND ($1::boolean IS TRUE OR e.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR EXISTS (
            SELECT 1 FROM schedule sx
            JOIN volunteers_departments vd ON vd.volunteer_id = sx.volunteer_id
            WHERE sx.event_id = e.id AND vd.department_id = ANY($4::int[])
          )
        )
      GROUP BY e.id, e.name, e.event_date
      ORDER BY e.event_date ASC
      LIMIT 10
      `,
      p
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.get('/reports/volunteer-ranking', authMiddleware, requireRole('admin', 'lider', 'super_admin'), async (req: AuthRequest, res) => {
  try {
    const scope = await getReportScope(req);
    const p = scopeParams(scope);
    const { rows } = await pool.query(
      `
      SELECT v.name, v.email,
        COUNT(s.id)::int as total_scheduled,
        COUNT(CASE WHEN s.status = 'confirmado' THEN 1 END)::int as confirmed,
        ROUND((COUNT(CASE WHEN s.status = 'confirmado' THEN 1 END) * 100.0) / NULLIF(COUNT(s.id), 0), 1) as participation_rate
      FROM volunteers v
      JOIN schedule s ON s.volunteer_id = v.id
      JOIN events e ON e.id = s.event_id
      WHERE ($1::boolean IS TRUE OR v.church_id = $2)
        AND ($1::boolean IS TRUE OR e.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR EXISTS (
            SELECT 1 FROM volunteers_departments vd
            WHERE vd.volunteer_id = v.id AND vd.department_id = ANY($4::int[])
          )
        )
      GROUP BY v.id, v.name, v.email
      HAVING COUNT(s.id) > 0
      ORDER BY confirmed DESC, participation_rate DESC
      LIMIT 5
      `,
      p
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.get('/reports/participation', authMiddleware, requireRole('admin', 'lider', 'super_admin'), async (req: AuthRequest, res) => {
  try {
    const scope = await getReportScope(req);
    const p = scopeParams(scope);
    const { rows } = await pool.query(
      `
      SELECT d.name AS department,
        COUNT(s.id)::int AS total_scheduled,
        COUNT(CASE WHEN s.status = 'confirmado' THEN 1 END)::int AS confirmed,
        ROUND(COUNT(CASE WHEN s.status = 'confirmado' THEN 1 END) * 100.0 / NULLIF(COUNT(s.id),0), 1) AS participation_rate
      FROM departments d
      LEFT JOIN volunteers_departments vd ON vd.department_id = d.id
      LEFT JOIN schedule s ON s.volunteer_id = vd.volunteer_id
      WHERE ($1::boolean IS TRUE OR d.church_id = $2)
        AND (
          $3::boolean IS NOT TRUE
          OR d.id = ANY($4::int[])
        )
      GROUP BY d.id, d.name ORDER BY participation_rate DESC
      `,
      p
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.get(
  '/reports/satisfaction-filters',
  authMiddleware,
  requireRole('admin', 'lider', 'super_admin'),
  async (req: AuthRequest, res) => {
    try {
      const u = req.user!;
      const churchId = req.query.church_id ? Number(req.query.church_id) : null;
      const scope = await getReportScope(req);
      const data = await satisfactionService.getSatisfactionFilterOptions(
        u.role,
        u.church_id,
        churchId,
        scope.leaderDeptIds
      );
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

router.get(
  '/reports/satisfaction-evolution',
  authMiddleware,
  requireRole('admin', 'lider', 'super_admin'),
  async (req: AuthRequest, res) => {
    try {
      const u = req.user!;
      const scope = await getReportScope(req);
      const data = await satisfactionService.getSatisfactionEvolution(
        u.role,
        u.church_id,
        {
          church_id: req.query.church_id ? Number(req.query.church_id) : null,
          mode: String(req.query.mode || 'geral'),
          department_id: req.query.department_id ? Number(req.query.department_id) : null,
          volunteer_id: req.query.volunteer_id ? Number(req.query.volunteer_id) : null,
        },
        scope.leaderDeptIds
      );
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  }
);

// ===== NOTIFICATIONS =====
router.get('/notifications/sync', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const u = req.user!;
    await notificationService.syncNotificationsForUser(u.id, u.role, u.church_id);
    const [items, unread, toasts] = await Promise.all([
      notificationService.listNotifications(u.id),
      notificationService.unreadCount(u.id),
      notificationService.toastQueue(u.id),
    ]);
    res.json({ items, unread, toasts });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/notifications', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const u = req.user!;
    const items = await notificationService.listNotifications(u.id);
    const unread = await notificationService.unreadCount(u.id);
    res.json({ items, unread });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/notifications/:id/read', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await notificationService.markRead(Number(req.params.id), req.user!.id);
    const unread = await notificationService.unreadCount(req.user!.id);
    res.json({ ok: true, unread });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/notifications/read-all', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await notificationService.markAllRead(req.user!.id);
    res.json({ ok: true, unread: 0 });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/notifications/:id/toast-shown', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await notificationService.markToastShown(Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// ===== CHECK-IN =====
router.get('/checkin/:eventId', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await assertEventInUserScope(Number(req.params.eventId), req);
    const { rows } = await pool.query(
      `
      SELECT s.id, s.status, v.name AS volunteer_name, r.name AS role_name
      FROM schedule s
      JOIN volunteers v ON v.id = s.volunteer_id
      LEFT JOIN roles r ON r.id = s.role_id
      WHERE s.event_id = $1 ORDER BY v.name
      `,
      [req.params.eventId]
    );
    res.json(rows);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

router.patch('/checkin/:scheduleId', authMiddleware, requireRole('admin', 'lider'), async (req: AuthRequest, res) => {
  try {
    const status = req.body.status as 'confirmado' | 'pendente' | 'recusado';
    if (!['confirmado', 'pendente', 'recusado'].includes(status)) {
      res.status(400).json({ error: 'Status inválido' });
      return;
    }
    await assertScheduleInUserScope(Number(req.params.scheduleId), req);
    const { rows } = await pool.query(
      'UPDATE schedule SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.scheduleId]
    );
    res.json(rows[0]);
  } catch (e: any) {
    if (handleAccessError(res, e)) return;
    res.status(400).json({ error: e.message });
  }
});

export default router;
