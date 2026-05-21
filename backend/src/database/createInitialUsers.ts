import { register } from '../services/authService';
import { pool } from './index';
import { isProductionLikeMode } from '../utils/appMode';
import { TEST_DEFAULT_PASSWORD } from '../utils/testCredentials';

async function getChurchIds() {
  const { rows } = await pool.query('SELECT id FROM churches ORDER BY id ASC');
  const firstChurchId = rows[0]?.id ? Number(rows[0].id) : null;
  const secondChurchId = rows[1]?.id ? Number(rows[1].id) : firstChurchId;
  return { firstChurchId, secondChurchId };
}

async function ensureVolunteerRole(email: string, roleName: string) {
  await pool.query(
    `
      INSERT INTO volunteer_roles (volunteer_id, role_id)
      SELECT v.id, r.id
      FROM volunteers v
      JOIN roles r ON r.name = $2
      JOIN departments d ON d.id = r.department_id AND d.church_id = v.church_id
      WHERE v.email = $1
      ON CONFLICT (volunteer_id, role_id) DO NOTHING
    `,
    [email, roleName]
  );
}

async function ensureAdmin(data: { name: string; email: string; password: string; church_id?: number }) {
  if (!data.church_id) {
    throw new Error(`church_id obrigatório para criar administrador (${data.email})`);
  }
  const { rowCount } = await pool.query('SELECT 1 FROM volunteers WHERE email = $1', [data.email]);
  if (rowCount === 0) {
    await register({
      name: data.name,
      email: data.email,
      password: data.password,
      role: 'admin',
      church_id: data.church_id,
      status: 'active',
      phone_ddd: '11',
      phone_number: '999999999',
    });
    console.log(`✓ Administrador criado (${data.email})`);
  } else {
    await pool.query('UPDATE volunteers SET status = $1 WHERE email = $2', ['active', data.email]);
  }
}

export async function createInitialUsers() {
  try {
    const productionLike = isProductionLikeMode();
    const { firstChurchId, secondChurchId } = await getChurchIds();

    if (!firstChurchId) {
      throw new Error('Nenhuma igreja encontrada para vincular usuários iniciais');
    }

    // SUPER ADMIN sempre existe para fluxos globais do sistema.
    const { rowCount: superCount } = await pool.query('SELECT id FROM volunteers WHERE email = $1', [
      'super@escalas.com',
    ]);
    if (superCount === 0) {
      await register({
        name: 'Super Admin',
        email: 'super@escalas.com',
        password: TEST_DEFAULT_PASSWORD,
        role: 'super_admin',
      });
      console.log(`✓ SUPER ADMIN criado (super@escalas.com / ${TEST_DEFAULT_PASSWORD}) — aprovação de voluntários, supervisão`);
    }

    // Admin Escalas: super_admin global, sem igreja (controle de todas as filiais).
    const { rowCount: adminCount } = await pool.query('SELECT id FROM volunteers WHERE email = $1', [
      'admin@escalas.com',
    ]);
    if (adminCount === 0) {
      await register({
        name: 'Admin Escalas',
        email: 'admin@escalas.com',
        password: TEST_DEFAULT_PASSWORD,
        role: 'super_admin',
        status: 'active',
      });
      console.log(
        `✓ Admin Escalas criado (admin@escalas.com / ${TEST_DEFAULT_PASSWORD}) — super_admin, todas as igrejas`
      );
    } else {
      await pool.query(
        `UPDATE volunteers SET role = 'super_admin', church_id = NULL, status = 'active' WHERE email = $1`,
        ['admin@escalas.com']
      );
    }

    if (productionLike) {
      return;
    }

    // 1. LIDER (gerencia seu departamento)
    const { rowCount: liderCount } = await pool.query('SELECT id FROM volunteers WHERE email = $1', [
      'lider@escalas.com',
    ]);
    if (liderCount === 0) {
      await register({
        name: 'João Líder',
        email: 'lider@escalas.com',
        password: TEST_DEFAULT_PASSWORD,
        role: 'lider',
        church_id: firstChurchId,
        status: 'active',
        phone_ddd: '11',
        phone_number: '999980001',
      });
      console.log(`✓ LIDER criado (lider@escalas.com / ${TEST_DEFAULT_PASSWORD}) — gerencia seu departamento`);
    }

    // 2. VOLUNTARIO (voluntário comum)
    const { rowCount: volCount } = await pool.query('SELECT id FROM volunteers WHERE email = $1', [
      'voluntario@escalas.com',
    ]);
    if (volCount === 0) {
      await register({
        name: 'Maria Voluntária',
        email: 'voluntario@escalas.com',
        password: TEST_DEFAULT_PASSWORD,
        role: 'voluntario',
        church_id: firstChurchId,
        status: 'active',
        phone_ddd: '11',
        phone_number: '999970001',
      });
      console.log(`✓ VOLUNTARIO criado (voluntario@escalas.com / ${TEST_DEFAULT_PASSWORD}) — voluntário comum`);
    }

    if (!productionLike) {
      // Usuários adicionais para ambiente de teste
      await ensureAdmin({
        name: 'Admin Igreja 1',
        email: 'admin-igreja1@escalas.com',
        password: TEST_DEFAULT_PASSWORD,
        church_id: firstChurchId,
      });

      await ensureAdmin({
        name: 'Admin Igreja 2',
        email: 'admin-igreja2@escalas.com',
        password: TEST_DEFAULT_PASSWORD,
        church_id: secondChurchId || firstChurchId,
      });
    }

    // Vínculos de funções padrão para facilitar uso imediato na escala
    await ensureVolunteerRole('lider@escalas.com', 'Vocal');
    await ensureVolunteerRole('voluntario@escalas.com', 'Baixo');
    await ensureVolunteerRole('voluntario@escalas.com', 'Vocal');
    await ensureVolunteerRole('ana.voluntaria@escalas.com', 'Guitarrista');
    await ensureVolunteerRole('juliana.voluntaria@escalas.com', 'Teclado');
    await ensureVolunteerRole('carlos.voluntario@escalas.com', 'Operador de Som');
  } catch (err) {
    console.error('Erro ao criar usuários iniciais:', err);
  }
}
