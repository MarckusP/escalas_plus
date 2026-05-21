import { pool } from './index';
import { register } from '../services/authService';
import { isTestMode } from '../utils/appMode';
import * as scheduleService from '../services/scheduleService';

import { TEST_DEFAULT_PASSWORD } from '../utils/testCredentials';

const PASS = TEST_DEFAULT_PASSWORD;

/** Ciclo fechado para testes: 2 igrejas × (2 líderes Louvor/Mídia + 2 voluntários), mesmo papel para troca. */

async function volunteerIdByEmail(email: string): Promise<number | null> {
  const { rows } = await pool.query('SELECT id FROM volunteers WHERE email = $1', [email]);
  return rows[0]?.id ?? null;
}

async function deptId(churchId: number, name: string): Promise<number | null> {
  const { rows } = await pool.query(
    'SELECT id FROM departments WHERE church_id = $1 AND name = $2 LIMIT 1',
    [churchId, name]
  );
  return rows[0]?.id ?? null;
}

async function roleIdForDept(departmentId: number, roleName: string): Promise<number | null> {
  const { rows } = await pool.query(
    'SELECT id FROM roles WHERE department_id = $1 AND name = $2 LIMIT 1',
    [departmentId, roleName]
  );
  return rows[0]?.id ?? null;
}

async function ensureVolunteerRole(volunteerId: number, roleId: number) {
  await pool.query(
    `INSERT INTO volunteer_roles (volunteer_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
    [volunteerId, roleId]
  );
}

async function linkDept(volunteerId: number, departmentId: number, isLeader: boolean) {
  await pool.query(
    `INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
     VALUES ($1,$2,$3)
     ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader`,
    [volunteerId, departmentId, isLeader]
  );
}

async function ensurePerson(data: {
  name: string;
  email: string;
  role: 'lider' | 'voluntario';
  church_id: number;
  phone_number: string;
}) {
  const { rowCount } = await pool.query('SELECT 1 FROM volunteers WHERE email = $1', [data.email]);
  if (rowCount === 0) {
    await register({
      name: data.name,
      email: data.email,
      password: PASS,
      role: data.role,
      church_id: data.church_id,
      status: 'active',
      phone_ddd: '11',
      phone_number: data.phone_number,
    });
  }
}

function dayOfWeekFromDate(raw: string | Date): number {
  if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const [y, m, d] = raw.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }
  return new Date(raw).getDay();
}

async function seedChurch(churchId: number, igIndex: number) {
  const eventName = `Culto Ciclo Fechado (Teste IG${igIndex})`;
  const { rows: existing } = await pool.query(
    `SELECT id FROM events WHERE church_id = $1 AND name = $2 LIMIT 1`,
    [churchId, eventName]
  );
  if (existing[0]) {
    console.log(`✓ Ciclo de teste já instalado para igreja id=${churchId}`);
    return;
  }

  const louvorDeptId = await deptId(churchId, 'Louvor');
  const midiaDeptId = await deptId(churchId, 'Mídia');
  if (!louvorDeptId || !midiaDeptId) {
    console.warn(`Ciclo teste: Louvor/Mídia não encontrados para church_id=${churchId}`);
    return;
  }

  const eLouvor = `ciclo.louvor.ig${igIndex}@escalas.com`;
  const eMidia = `ciclo.midia.ig${igIndex}@escalas.com`;
  const eVolA = `ciclo.volA.ig${igIndex}@escalas.com`;
  const eVolB = `ciclo.volB.ig${igIndex}@escalas.com`;

  await ensurePerson({
    name: `Líder Louvor (Ciclo IG${igIndex})`,
    email: eLouvor,
    role: 'lider',
    church_id: churchId,
    phone_number: `98001${igIndex}001`,
  });
  await ensurePerson({
    name: `Líder Mídia (Ciclo IG${igIndex})`,
    email: eMidia,
    role: 'lider',
    church_id: churchId,
    phone_number: `98001${igIndex}002`,
  });
  await ensurePerson({
    name: `Voluntário A (Ciclo IG${igIndex})`,
    email: eVolA,
    role: 'voluntario',
    church_id: churchId,
    phone_number: `98001${igIndex}003`,
  });
  await ensurePerson({
    name: `Voluntário B (Ciclo IG${igIndex})`,
    email: eVolB,
    role: 'voluntario',
    church_id: churchId,
    phone_number: `98001${igIndex}004`,
  });

  const idLouvor = await volunteerIdByEmail(eLouvor);
  const idMidia = await volunteerIdByEmail(eMidia);
  const idA = await volunteerIdByEmail(eVolA);
  const idB = await volunteerIdByEmail(eVolB);
  if (!idLouvor || !idMidia || !idA || !idB) return;

  await linkDept(idLouvor, louvorDeptId, true);
  await linkDept(idMidia, midiaDeptId, true);
  await linkDept(idA, louvorDeptId, false);
  await linkDept(idB, louvorDeptId, false);

  const vocalL = await roleIdForDept(louvorDeptId, 'Vocal');
  const guitarL = await roleIdForDept(louvorDeptId, 'Guitarrista');
  const opSomM = await roleIdForDept(midiaDeptId, 'Operador de Som');
  if (vocalL) await ensureVolunteerRole(idLouvor, vocalL);
  if (opSomM) await ensureVolunteerRole(idMidia, opSomM);
  if (guitarL) {
    await ensureVolunteerRole(idA, guitarL);
    await ensureVolunteerRole(idB, guitarL);
  }

  const { rows: evRows } = await pool.query(
    `INSERT INTO events (name, event_date, church_id, address, description, event_time)
     VALUES ($1, (CURRENT_DATE + INTERVAL '14 days')::date, $2, $3, $4, $5)
     RETURNING id, event_date`,
    [eventName, churchId, 'Endereço demo — ciclo de testes', 'Evento para fluxo completo (trocas, aprovações)', '19:00:00']
  );
  const eventId = evRows[0].id as number;
  const eventDate = evRows[0].event_date;
  const dow = dayOfWeekFromDate(eventDate);

  for (const vid of [idA, idB]) {
    for (const period of ['manha', 'tarde', 'noite'] as const) {
      await pool.query(
        `INSERT INTO availability (volunteer_id, day_of_week, period, available)
         VALUES ($1, $2, $3, true)
         ON CONFLICT (volunteer_id, day_of_week, period) DO NOTHING`,
        [vid, dow, period]
      );
    }
  }

  if (guitarL) {
    const row = await scheduleService.addToSchedule(eventId, idA, guitarL);
    if (row?.id) await scheduleService.confirmSchedule(row.id);
  }

  console.log(
    `✓ Ciclo fechado igreja ${churchId}: evento "${eventName}" (id=${eventId}). Troca: ${eVolA} (escalado confirmado) ↔ ${eVolB} (alvo, Guitarrista) — senha ${PASS}`
  );
}

export async function seedClosedTestCycle() {
  if (!isTestMode()) return;

  const { rows } = await pool.query('SELECT id FROM churches ORDER BY id ASC LIMIT 2');
  let idx = 0;
  for (const r of rows) {
    idx += 1;
    await seedChurch(Number(r.id), idx);
  }

  console.log('');
  console.log(`📋 Resumo ciclo de testes (senha ${PASS}):`);
  console.log('   Admins: admin-igreja1@escalas.com / admin-igreja2@escalas.com');
  console.log('   Por igreja: ciclo.louvor.ig{n}@, ciclo.midia.ig{n}@, ciclo.volA.ig{n}@, ciclo.volB.ig{n}@');
  console.log('');
}
