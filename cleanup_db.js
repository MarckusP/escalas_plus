const { Pool } = require('pg');
const dotenv = require('dotenv');
const path = require('path');

// Carregar .env do backend
dotenv.config({ path: path.join(__dirname, 'backend', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function cleanup() {
  const client = await pool.connect();
  try {
    console.log('Iniciando limpeza da base de dados...');
    await client.query('BEGIN');

    // Identificar o primeiro super_admin para manter
    const { rows: admins } = await client.query("SELECT id FROM volunteers WHERE role = 'super_admin' ORDER BY id ASC LIMIT 1");
    const superAdminId = admins[0]?.id;

    if (!superAdminId) {
      console.error('Super admin não encontrado! Abortando para evitar perda total de acesso.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Mantendo super_admin ID: ${superAdminId}`);

    // Limpar tabelas dependentes
    await client.query('TRUNCATE swaps, schedule, event_required_roles, availability, tasks RESTART IDENTITY CASCADE');
    
    // Limpar eventos
    await client.query('DELETE FROM events');
    
    // Limpar associações de voluntários
    await client.query('DELETE FROM volunteer_roles WHERE volunteer_id != $1', [superAdminId]);
    await client.query('DELETE FROM volunteers_departments WHERE volunteer_id != $1', [superAdminId]);

    // Limpar roles e departamentos
    await client.query('DELETE FROM roles CASCADE');
    await client.query('DELETE FROM departments CASCADE');

    // Limpar outros voluntários
    await client.query('DELETE FROM volunteers WHERE id != $1', [superAdminId]);

    // Limpar igrejas
    await client.query('DELETE FROM churches CASCADE');

    await client.query('COMMIT');
    console.log('Limpeza concluída com sucesso. Apenas o super_admin inicial foi mantido.');
  } catch (err) {
    if (client) await client.query('ROLLBACK');
    console.error('Erro durante a limpeza:', err);
  } finally {
    if (client) client.release();
    await pool.end();
    process.exit();
  }
}

cleanup();
