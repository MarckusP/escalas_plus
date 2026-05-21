import { pool } from '../database';

const JOB_NAME = 'satisfacao_mensal_reset';

export async function runMonthlySatisfactionResetIfDue(): Promise<void> {
  const today = new Date();
  if (today.getDate() !== 1) return;

  const dateStr = today.toISOString().slice(0, 10);
  const { rows } = await pool.query(
    'SELECT last_run_date FROM scheduler_runs WHERE job_name = $1',
    [JOB_NAME]
  );
  if (rows[0] && String(rows[0].last_run_date).slice(0, 10) === dateStr) {
    return;
  }

  await pool.query('SELECT reset_satisfacao_mensal()');
  await pool.query(
    `
    INSERT INTO scheduler_runs (job_name, last_run_date)
    VALUES ($1, $2::date)
    ON CONFLICT (job_name) DO UPDATE SET last_run_date = EXCLUDED.last_run_date
    `,
    [JOB_NAME, dateStr]
  );
  console.log(`✓ Job mensal: satisfacao_resp resetado (${dateStr})`);
}

export function scheduleMonthlySatisfactionReset(): void {
  runMonthlySatisfactionResetIfDue().catch(err =>
    console.error('Erro no reset de satisfação:', err)
  );
  const dayMs = 24 * 60 * 60 * 1000;
  setInterval(() => {
    runMonthlySatisfactionResetIfDue().catch(err =>
      console.error('Erro no reset de satisfação:', err)
    );
  }, dayMs);
}

export async function submitSatisfaction(volunteerId: number, score: number) {
  if (!Number.isFinite(score) || score < 1 || score > 10) {
    throw new Error('Nota deve ser entre 1 e 10');
  }
  const { rows: vol } = await pool.query(
    `SELECT id, role, status, satisfacao_resp FROM volunteers WHERE id = $1`,
    [volunteerId]
  );
  if (!vol[0]) throw new Error('Voluntário não encontrado');
  if (vol[0].role !== 'voluntario') throw new Error('Apenas voluntários respondem a pesquisa');
  if (vol[0].status !== 'active') throw new Error('Conta não está ativa');
  if (Number(vol[0].satisfacao_resp) === 1) {
    throw new Error('Pesquisa de satisfação já respondida neste período');
  }

  const today = new Date().toISOString().slice(0, 10);
  await pool.query(
    `
    INSERT INTO volunteer_satisfaction (volunteer_id, response_date, score)
    VALUES ($1, $2::date, $3)
    `,
    [volunteerId, today, Math.round(score)]
  );
  await pool.query('UPDATE volunteers SET satisfacao_resp = 1 WHERE id = $1', [volunteerId]);
  return { ok: true, score: Math.round(score) };
}

export async function getSatisfactionStatus(volunteerId: number) {
  const { rows } = await pool.query(
    'SELECT satisfacao_resp, role, status FROM volunteers WHERE id = $1',
    [volunteerId]
  );
  if (!rows[0]) throw new Error('Voluntário não encontrado');
  return {
    needs_response:
      rows[0].role === 'voluntario' &&
      rows[0].status === 'active' &&
      Number(rows[0].satisfacao_resp) === 0,
    satisfacao_resp: Number(rows[0].satisfacao_resp),
  };
}

function resolveChurchId(
  role: string,
  userChurchId: number | null,
  queryChurchId?: number | null
): number | null {
  if (role === 'super_admin') {
    return queryChurchId != null && queryChurchId > 0 ? queryChurchId : null;
  }
  return userChurchId;
}

const LEADER_VOL_FILTER = `
  AND (
    cardinality($2::int[]) = 0
    OR EXISTS (
      SELECT 1 FROM volunteers_departments vd
      WHERE vd.volunteer_id = v.id AND vd.department_id = ANY($2::int[])
    )
  )
`;

export async function getSatisfactionFilterOptions(
  role: string,
  userChurchId: number | null,
  queryChurchId?: number | null,
  leaderDeptIds: number[] = []
) {
  const cid = resolveChurchId(role, userChurchId, queryChurchId);
  if (!cid) throw new Error('church_id é obrigatório');

  const deptIds = leaderDeptIds.length > 0 ? leaderDeptIds : [];
  const { rows: departments } = await pool.query(
    deptIds.length > 0
      ? `SELECT id, name FROM departments WHERE church_id = $1 AND id = ANY($2::int[]) ORDER BY name`
      : 'SELECT id, name FROM departments WHERE church_id = $1 ORDER BY name',
    deptIds.length > 0 ? [cid, deptIds] : [cid]
  );
  const { rows: volunteers } = await pool.query(
    `
    SELECT DISTINCT v.id, v.name
    FROM volunteers v
    WHERE v.church_id = $1 AND v.role = 'voluntario' AND v.active = true
    ${LEADER_VOL_FILTER}
    ORDER BY v.name
    `,
    [cid, deptIds]
  );
  const { rows: churches } =
    role === 'super_admin'
      ? await pool.query('SELECT id, name FROM churches ORDER BY name')
      : { rows: [] as { id: number; name: string }[] };

  return { church_id: cid, departments, volunteers, churches };
}

export async function getSatisfactionEvolution(
  role: string,
  userChurchId: number | null,
  opts: {
    church_id?: number | null;
    mode?: string;
    department_id?: number | null;
    volunteer_id?: number | null;
  },
  leaderDeptIds: number[] = []
) {
  const cid = resolveChurchId(role, userChurchId, opts.church_id);
  if (!cid) throw new Error('church_id é obrigatório');

  const mode = opts.mode || 'geral';
  const deptScope = leaderDeptIds.length > 0 ? leaderDeptIds : [];

  if (mode === 'geral') {
    const { rows } = await pool.query(
      `
      SELECT to_char(vs.response_date, 'YYYY-MM') AS period,
             ROUND(AVG(vs.score)::numeric, 2) AS avg_score,
             COUNT(*)::int AS responses
      FROM volunteer_satisfaction vs
      JOIN volunteers v ON v.id = vs.volunteer_id
      WHERE v.church_id = $1 AND v.role = 'voluntario'
      ${LEADER_VOL_FILTER}
      GROUP BY 1
      ORDER BY 1
      `,
      [cid, deptScope]
    );
    return { mode, series: rows };
  }

  if (mode === 'ministerio') {
    const deptId =
      opts.department_id != null && opts.department_id > 0 ? opts.department_id : null;
    const params: (number | number[] | null)[] = [cid, deptId, deptScope];
    const { rows } = await pool.query(
      `
      SELECT to_char(vs.response_date, 'YYYY-MM') AS period,
             d.name AS label,
             d.id AS department_id,
             ROUND(AVG(vs.score)::numeric, 2) AS avg_score,
             COUNT(*)::int AS responses
      FROM volunteer_satisfaction vs
      JOIN volunteers v ON v.id = vs.volunteer_id
      JOIN volunteers_departments vd ON vd.volunteer_id = v.id
      JOIN departments d ON d.id = vd.department_id
      WHERE v.church_id = $1
        AND ($2::integer IS NULL OR d.id = $2)
        AND (
          cardinality($3::int[]) = 0
          OR d.id = ANY($3::int[])
        )
      GROUP BY 1, d.id, d.name
      ORDER BY 1, d.name
      `,
      params
    );
    return { mode, series: rows };
  }

  if (mode === 'individual') {
    const vid =
      opts.volunteer_id != null && opts.volunteer_id > 0 ? opts.volunteer_id : null;
    if (!vid) throw new Error('volunteer_id é obrigatório no modo individual');
    const { rows } = await pool.query(
      `
      SELECT vs.response_date::text AS period,
             v.name AS label,
             vs.score AS avg_score,
             1 AS responses
      FROM volunteer_satisfaction vs
      JOIN volunteers v ON v.id = vs.volunteer_id
      WHERE v.church_id = $1 AND v.id = $2
      ${LEADER_VOL_FILTER}
      ORDER BY vs.response_date ASC
      `,
      [cid, vid, deptScope]
    );
    return { mode, series: rows };
  }

  throw new Error('Modo de visualização inválido');
}
