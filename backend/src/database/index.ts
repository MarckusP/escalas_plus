import { Pool } from 'pg';
import dotenv from 'dotenv';
import { defaultDatabaseName } from '../utils/appMode';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  database: defaultDatabaseName(),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});
