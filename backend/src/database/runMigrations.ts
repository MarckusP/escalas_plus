import fs from 'fs';
import path from 'path';
import { pool } from './index';
import { isTestMode } from '../utils/appMode';

export async function runMigrations() {
  const includeFullInserts = isTestMode();

  const tablesDir = path.join(process.cwd(), 'src', 'database', 'tables');
  const insertsDir = path.join(process.cwd(), 'src', 'database', 'inserts');
  const patchesDir = path.join(process.cwd(), 'src', 'database', 'patches');

  let retries = 10;
  while (retries > 0) {
    try {
      await pool.query('SELECT 1');
      console.log('✓ Database is ready');
      break;
    } catch (err) {
      console.log(`Database not ready, retrying... (${retries} retries left)`);
      retries -= 1;
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (retries === 0) {
        throw new Error('Could not connect to the database after multiple retries.');
      }
    }
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS applied_migrations (
      id SERIAL PRIMARY KEY,
      filename VARCHAR(255) UNIQUE NOT NULL,
      executed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query('SELECT filename FROM applied_migrations');
  const applied = new Set(rows.map(r => r.filename));

  for (const dir of [tablesDir, patchesDir, insertsDir]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).sort();
    for (const file of files) {
      if (!file.endsWith('.sql')) continue;

      // Em modo teste roda inserts completos.
      // Em prod ignora inserts fictícios (_desenv_).
      if (dir === insertsDir && file.toLowerCase().includes('_desenv_') && !includeFullInserts) {
        continue;
      }

      if (applied.has(file)) {
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), 'utf-8');
      await pool.query(sql);
      await pool.query('INSERT INTO applied_migrations (filename) VALUES ($1)', [file]);
      console.log(`✓ Migration installed: ${file}`);
    }
  }
}
