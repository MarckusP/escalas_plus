import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import {
  getAppMode,
  getHmlDatabaseName,
  getProdDatabaseName,
  isProdMode,
} from '../utils/appMode';

const execFileAsync = promisify(execFile);

function assertDbName(name: string): string {
  if (!/^[a-z0-9_]+$/.test(name)) {
    throw new Error(`Nome de banco inválido: ${name}`);
  }
  return name;
}

function pgEnv() {
  return {
    ...process.env,
    PGPASSWORD: process.env.DB_PASSWORD || 'postgres',
  };
}

function pgBaseArgs(): string[] {
  return [
    '-h',
    process.env.DB_HOST || 'localhost',
    '-p',
    String(process.env.DB_PORT || 5432),
    '-U',
    process.env.DB_USER || 'postgres',
  ];
}

async function runPsql(database: string, sql: string): Promise<void> {
  await execFileAsync('psql', [...pgBaseArgs(), '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    env: pgEnv(),
    maxBuffer: 20 * 1024 * 1024,
  });
}

/**
 * Apaga o banco de homologação e repõe com cópia integral do banco de produção atual.
 */
export async function syncProductionDatabaseToHomolog(): Promise<{ prod: string; hml: string }> {
  if (!isProdMode()) {
    throw new Error('A sincronização só pode ser executada com APP_MODE=prod no backend.');
  }

  const prodDb = assertDbName(getProdDatabaseName());
  const hmlDb = assertDbName(getHmlDatabaseName());

  if (prodDb === hmlDb) {
    throw new Error('Bancos de produção e homologação não podem ser o mesmo.');
  }

  const currentDb = process.env.DB_NAME || prodDb;
  if (currentDb !== prodDb) {
    throw new Error(
      `O backend deve estar conectado ao banco de produção (${prodDb}). Atual: ${currentDb}.`
    );
  }

  console.log(`[sync] Encerrando conexões em ${hmlDb}...`);
  await runPsql(
    'postgres',
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${hmlDb.replace(/'/g, "''")}' AND pid <> pg_backend_pid();`
  );

  console.log(`[sync] Recriando banco ${hmlDb}...`);
  await runPsql('postgres', `DROP DATABASE IF EXISTS ${hmlDb};`);
  await runPsql('postgres', `CREATE DATABASE ${hmlDb};`);

  console.log(`[sync] Copiando ${prodDb} → ${hmlDb} (pg_dump)...`);
  const dumpArgs = [...pgBaseArgs(), '-d', prodDb, '--no-owner', '--no-acl'];
  const { stdout: dumpSql } = await execFileAsync('pg_dump', dumpArgs, {
    env: pgEnv(),
    maxBuffer: 256 * 1024 * 1024,
  });

  await new Promise<void>((resolve, reject) => {
    const psql = spawn('psql', [...pgBaseArgs(), '-d', hmlDb, '-v', 'ON_ERROR_STOP=1'], {
      env: pgEnv(),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    psql.stdin.write(dumpSql);
    psql.stdin.end();
    psql.on('error', reject);
    psql.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`psql restore terminou com código ${code}`));
    });
  });

  console.log(`[sync] Concluído: ${prodDb} → ${hmlDb} (APP_MODE=${getAppMode()})`);
  return { prod: prodDb, hml: hmlDb };
}
