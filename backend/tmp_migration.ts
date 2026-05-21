import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'escalas',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function run() {
  try {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'tables', '012_volunteer_status.sql'), 'utf-8');
    await pool.query(sql);
    console.log('✓ Manual migration 012 applied successfully');
  } catch (err: any) {
    if (err.message.includes('already exists')) {
        console.log('✓ Migration 012 already applied');
    } else {
        console.error('Migration 012 failed:', err.message);
    }
  } finally {
    await pool.end();
  }
}

run();
