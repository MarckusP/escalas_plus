import { Pool } from 'pg';
const ENV_DATABASES = ['escalas_teste', 'escalas_hml', 'escalas_prod', 'escalas'] as const;

/** Garante os bancos de ambiente em volumes Postgres já existentes (init só roda na 1ª vez). */
export async function ensureEnvironmentDatabasesExist(): Promise<void> {
  const admin = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
  });

  try {
    for (const name of ENV_DATABASES) {
      const { rowCount } = await admin.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [name]
      );
      if (rowCount === 0) {
        await admin.query(`CREATE DATABASE ${name}`);
        console.log(`✓ Banco criado: ${name}`);
      }
    }
  } finally {
    await admin.end();
  }
}
