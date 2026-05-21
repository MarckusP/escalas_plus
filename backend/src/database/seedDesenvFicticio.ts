import { pool } from './index';
import { register } from '../services/authService';
import { isTestMode } from '../utils/appMode';
import { TEST_DEFAULT_PASSWORD } from '../utils/testCredentials';
import * as scheduleService from '../services/scheduleService';

const DEMO_EVENT = 'Culto Dominical (Demo)';

async function volunteerIdByEmail(email: string): Promise<number | null> {
  const { rows } = await pool.query('SELECT id FROM volunteers WHERE email = $1', [email]);
  return rows[0]?.id ?? null;
}

async function ensureVoluntario(data: {
  name: string;
  email: string;
  password: string;
  church_id: number;
  status?: string;
  phone_ddd?: string;
  phone_number?: string;
}) {
  const { rowCount } = await pool.query('SELECT 1 FROM volunteers WHERE email = $1', [data.email]);
  if (rowCount === 0) {
    await register({
      name: data.name,
      email: data.email,
      password: data.password,
      role: 'voluntario',
      church_id: data.church_id,
      status: data.status || 'active',
      phone_ddd: data.phone_ddd,
      phone_number: data.phone_number,
    });
  }
}

async function linkDepartment(volunteerId: number, departmentId: number, isLeader: boolean) {
  await pool.query(
    `INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
     VALUES ($1, $2, $3)
     ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader`,
    [volunteerId, departmentId, isLeader]
  );
}

async function ensureDepartment(name: string, icon: string, church_id: number) {
  const { rowCount } = await pool.query('SELECT 1 FROM departments WHERE name = $1 AND church_id = $2', [name, church_id]);
  if (rowCount === 0) {
    const { rows } = await pool.query('INSERT INTO departments (name, icon, church_id) VALUES ($1,$2,$3) RETURNING id', [name, icon, church_id]);
    return rows[0].id;
  }
  const { rows } = await pool.query('SELECT id FROM departments WHERE name = $1 AND church_id = $2 LIMIT 1', [name, church_id]);
  return rows[0].id;
}

async function ensureRole(name: string, departmentId: number) {
  const { rowCount } = await pool.query('SELECT 1 FROM roles WHERE name = $1 AND department_id = $2', [name, departmentId]);
  if (rowCount === 0) {
    await pool.query('INSERT INTO roles (name, department_id) VALUES ($1,$2)', [name, departmentId]);
  }
}

async function getRoleId(name: string, churchId: number): Promise<number | null> {
  const { rows } = await pool.query(
    `
    SELECT r.id
    FROM roles r
    JOIN departments d ON d.id = r.department_id
    WHERE r.name = $1 AND d.church_id = $2
    LIMIT 1
    `,
    [name, churchId]
  );
  return rows[0]?.id ?? null;
}

async function ensureVolunteerRole(volunteerId: number, roleId: number) {
  await pool.query(
    `INSERT INTO volunteer_roles (volunteer_id, role_id) VALUES ($1,$2) ON CONFLICT (volunteer_id, role_id) DO NOTHING`,
    [volunteerId, roleId]
  );
}

/** Par lider@ + voluntario@: mesma função Vocal, escala confirmada do líder, alvo elegível para troca. */
async function ensureSwapDemoPair(eventId: number, churchId: number) {
  const liderId = await volunteerIdByEmail('lider@escalas.com');
  const volId = await volunteerIdByEmail('voluntario@escalas.com');
  const vocalRoleId = await getRoleId('Vocal', churchId);
  if (!liderId || !volId || !vocalRoleId) return;

  await pool.query(
    `UPDATE events
     SET event_date = (CURRENT_DATE + INTERVAL '14 days')::date,
         event_time = COALESCE(event_time, '19:00:00'::time)
     WHERE id = $1`,
    [eventId]
  );

  const louvorDepartmentId = await ensureDepartment('Louvor', '🎵', churchId);
  await linkDepartment(liderId, louvorDepartmentId, true);
  await linkDepartment(volId, louvorDepartmentId, false);
  await ensureVolunteerRole(liderId, vocalRoleId);
  await ensureVolunteerRole(volId, vocalRoleId);

  const { rows: ed } = await pool.query(
    'SELECT event_date::text AS event_date FROM events WHERE id = $1',
    [eventId]
  );
  let dow = new Date().getDay();
  const raw = ed[0]?.event_date as string | undefined;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, day] = raw.split('-').map(Number);
    dow = new Date(y, m - 1, day).getDay();
  }

  for (const vid of [liderId, volId]) {
    for (const period of ['manha', 'tarde', 'noite'] as const) {
      await pool.query(
        `INSERT INTO availability (volunteer_id, day_of_week, period, available)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (volunteer_id, day_of_week, period) DO UPDATE SET available = true`,
        [vid, dow, period]
      );
    }
  }

  await pool.query(
    `DELETE FROM unavailability u
     USING events e
     WHERE u.volunteer_id = ANY($1::int[])
       AND e.id = $2
       AND u.exception_date = e.event_date`,
    [[liderId, volId], eventId]
  );

  await scheduleService.addToSchedule(eventId, liderId, vocalRoleId);
  await pool.query(
    `UPDATE schedule SET status = 'confirmado' WHERE event_id = $1 AND volunteer_id = $2 AND role_id = $3`,
    [eventId, liderId, vocalRoleId]
  );

  console.log(
    '✓ Par troca de escalas (demo): lider@escalas.com (escalado Vocal confirmado) → alvo voluntario@escalas.com (Vocal + Louvor)'
  );
}

export async function seedDesenvFicticio() {
  if (!isTestMode()) return;

  const { rows: evRows } = await pool.query(
    'SELECT id FROM events WHERE name = $1 LIMIT 1',
    [DEMO_EVENT]
  );
  const eventId = evRows[0]?.id;
  if (!eventId) return;
  const { rows: eventRows } = await pool.query('SELECT church_id FROM events WHERE id = $1', [eventId]);
  const churchId = Number(eventRows[0]?.church_id || 0);
  if (!churchId) return;

  const { rows: cnt } = await pool.query(
    'SELECT COUNT(*)::int AS c FROM schedule WHERE event_id = $1',
    [eventId]
  );
  const hasSchedule = cnt[0].c > 0;

  await ensureVoluntario({
    name: 'Ana Costa',
    email: 'ana.voluntaria@escalas.com',
    password: TEST_DEFAULT_PASSWORD,
    church_id: churchId,
    status: 'active',
    phone_ddd: '11',
    phone_number: '999990001',
  });
  await ensureVoluntario({
    name: 'Carlos Mendes',
    email: 'carlos.voluntario@escalas.com',
    password: TEST_DEFAULT_PASSWORD,
    church_id: churchId,
    status: 'active',
    phone_ddd: '11',
    phone_number: '999990002',
  });
  await ensureVoluntario({
    name: 'Juliana Prado',
    email: 'juliana.voluntaria@escalas.com',
    password: TEST_DEFAULT_PASSWORD,
    church_id: churchId,
    status: 'active',
    phone_ddd: '11',
    phone_number: '999990003',
  });

  const liderId = await volunteerIdByEmail('lider@escalas.com');
  const anaId = await volunteerIdByEmail('ana.voluntaria@escalas.com');
  const carlosId = await volunteerIdByEmail('carlos.voluntario@escalas.com');
  const julianaId = await volunteerIdByEmail('juliana.voluntaria@escalas.com');

  const louvorDepartmentId = await ensureDepartment('Louvor', '🎵', churchId);
  // Líder é líder do departamento Louvor
  if (liderId) await linkDepartment(liderId, louvorDepartmentId, true);
  // Voluntários do ministério do líder (visíveis na tela do líder)
  if (anaId) await linkDepartment(anaId, louvorDepartmentId, false);
  if (carlosId) await linkDepartment(carlosId, louvorDepartmentId, false);
  if (julianaId) await linkDepartment(julianaId, louvorDepartmentId, false);
  // Voluntário base também vinculado ao Louvor
  const volId = await volunteerIdByEmail('voluntario@escalas.com');
  if (volId) await linkDepartment(volId, louvorDepartmentId, false);

  // Disponibilidade de exemplo (dia do culto demo — alinhado ao event_date)
  const { rows: ed } = await pool.query(
    'SELECT event_date::text AS event_date FROM events WHERE id = $1',
    [eventId]
  );
  let dow = new Date().getDay();
  const raw = ed[0]?.event_date as string | undefined;
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, day] = raw.split('-').map(Number);
    dow = new Date(y, m - 1, day).getDay();
  }

  for (const vid of [anaId, carlosId, julianaId].filter(Boolean) as number[]) {
    await pool.query(
      `INSERT INTO availability (volunteer_id, day_of_week, period, available)
       VALUES ($1, $2, 'manha', true), ($1, $2, 'tarde', true), ($1, $2, 'noite', true)
       ON CONFLICT (volunteer_id, day_of_week, period) DO NOTHING`,
      [vid, dow]
    );
  }

  if (hasSchedule) {
    await ensureSwapDemoPair(eventId, churchId);
    console.log('✓ Seed fictício: par de troca revalidado (lider@ ↔ voluntario@)');
    return;
  }

  const vocalRoleId = await getRoleId('Vocal', churchId);
  const guitarraRoleId = await getRoleId('Guitarrista', churchId);
  const tecladoRoleId = await getRoleId('Teclado', churchId);
  const baixoRoleId = await getRoleId('Baixo', churchId);
  if (anaId && guitarraRoleId) await scheduleService.addToSchedule(eventId, anaId, guitarraRoleId);
  if (julianaId && tecladoRoleId) await scheduleService.addToSchedule(eventId, julianaId, tecladoRoleId);
  if (volId && baixoRoleId) await scheduleService.addToSchedule(eventId, volId, baixoRoleId);

  await ensureSwapDemoPair(eventId, churchId);

  const adminId = await volunteerIdByEmail('admin@escalas.com');
  if (adminId && anaId) {
    const { rowCount } = await pool.query(
      `SELECT 1 FROM tasks WHERE title = $1 LIMIT 1`,
      ['Preparar lista de presença (demo)']
    );
    if (rowCount === 0) {
      await pool.query(
        `INSERT INTO tasks (title, description, assigned_to, created_by, priority, due_date, church_id, status)
         VALUES ($1, $2, $3, $4, 'media', (CURRENT_DATE + INTERVAL '5 days')::date, $5, 'novo')`,
        [
          'Preparar lista de presença (demo)',
          'Tarefa fictícia gerada automaticamente em APP_MODE=teste',
          anaId,
          adminId,
          churchId,
        ]
      );
    }
  }

  const commDeptId = await ensureDepartment('Comunicação', '📰', churchId);
  await ensureRole('Social Media', commDeptId);
  await ensureRole('Design Gráfico', commDeptId);
  await ensureRole('Marketing Digital', commDeptId);

  if (anaId) {
    await linkDepartment(anaId, commDeptId, false);
  }

  console.log('✓ Seed de dados fictícios (APP_MODE=teste): escalas, voluntários demo, departamento/roles extras e tarefa de exemplo');
}
