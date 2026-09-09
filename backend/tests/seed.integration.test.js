import { execFile, spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const spawnFile = (file, args) => new Promise((resolve, reject) => {
  const child = spawn(file, args, { stdio: 'ignore', windowsHide: true });
  child.once('error', reject);
  child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} terminou com código ${code}`)));
});

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

let databaseDir;
let postgres;
let pool;
let seedDatabaseUrl;

beforeAll(async () => {
  const port = await freePort();
  databaseDir = await mkdtemp(join(tmpdir(), 'caixafacil-seed-'));
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const architecture = process.arch === 'x64' ? 'x64' : process.arch;
  const extension = process.platform === 'win32' ? '.exe' : '';
  const bin = join(process.cwd(), '..', 'node_modules', '@embedded-postgres', `${platform}-${architecture}`, 'native', 'bin');
  const initdb = join(bin, `initdb${extension}`);
  const pgCtl = join(bin, `pg_ctl${extension}`);
  await execFileAsync(initdb, ['-D', databaseDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
  await spawnFile(pgCtl, ['-D', databaseDir, '-l', join(databaseDir, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start']);
  postgres = { stop: () => spawnFile(pgCtl, ['-D', databaseDir, '-m', 'fast', '-w', 'stop']) };
  const databaseUrl = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  seedDatabaseUrl = databaseUrl;
  await execFileAsync(process.execPath, ['prisma/seed.js', '--reset'], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 120_000,
  });
  pool = new pg.Pool({ connectionString: databaseUrl });
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
  if (postgres) await postgres.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
}, 30_000);

describe('seed rica multi-negócio', () => {
  it('cria proprietários, negócios, operadores e dados operacionais independentes', async () => {
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM users WHERE account_kind='owner' AND role='client') owners,
      (SELECT count(*)::int FROM businesses) businesses,
      (SELECT count(*)::int FROM users WHERE account_kind='operator') operators,
      (SELECT count(*)::int FROM products) products,
      (SELECT count(*)::int FROM customers) customers,
      (SELECT count(*)::int FROM cash_sessions WHERE status='open') open_sessions`);
    expect(counts.rows[0]).toEqual({
      owners: 3, businesses: 9, operators: 9, products: 270, customers: 198, open_sessions: 9,
    });
  });

  it('preenche auditoria por negócio e não inclui contato pessoal nos detalhes', async () => {
    const audit = await pool.query(`SELECT count(*)::int total,
      count(DISTINCT business_id)::int businesses,
      bool_and(actor_id IS NOT NULL AND actor_role IN ('OWNER','OPERATOR')) complete,
      bool_and(details::text !~* '(telefone|phone|email|whatsapp\\.com)') safe
      FROM admin_audit_logs WHERE business_id IS NOT NULL`);
    expect(audit.rows[0]).toEqual({ total: 81, businesses: 9, complete: true, safe: true });
  });

  it('atualiza somente a demonstração sem duplicar a massa', async () => {
    await execFileAsync(process.execPath, ['prisma/seed.js', '--refresh-demo'], {
      cwd: process.cwd(), env: { ...process.env, DATABASE_URL: seedDatabaseUrl }, timeout: 120_000,
    });
    const counts = await pool.query(`SELECT
      (SELECT count(*)::int FROM businesses) businesses,
      (SELECT count(*)::int FROM users WHERE account_kind='operator') operators,
      (SELECT count(*)::int FROM admin_audit_logs WHERE business_id IS NOT NULL) audit_events`);
    expect(counts.rows[0]).toEqual({ businesses: 9, operators: 9, audit_events: 81 });
  });
});
