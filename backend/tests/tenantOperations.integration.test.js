import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';
const OPERATOR_A = '33333333-3333-4333-8333-333333333333';
const PRODUCT_A = '44444444-4444-4444-8444-444444444444';
const PRODUCT_B = '55555555-5555-4555-8555-555555555555';
const SESSION_A = '66666666-6666-4666-8666-666666666666';
const AUTH_OWNER_A = '77777777-7777-4777-8777-777777777777';
const AUTH_OPERATOR_A = '88888888-8888-4888-8888-888888888888';
const AUTH_OWNER_B = '99999999-9999-4999-8999-999999999999';

let postgres;
let databaseDir;
let pool;
let ensureSchema;
let app;
let tokenOwnerA;
let tokenOwnerB;
let tokenOperatorA;
let refreshOperatorA;
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

const bearer = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  const port = await freePort();
  databaseDir = await mkdtemp(join(tmpdir(), 'caixafacil-pg-'));
  const platform = process.platform === 'win32' ? 'windows' : process.platform;
  const architecture = process.arch === 'x64' ? 'x64' : process.arch;
  const extension = process.platform === 'win32' ? '.exe' : '';
  const bin = join(process.cwd(), '..', 'node_modules', '@embedded-postgres', `${platform}-${architecture}`, 'native', 'bin');
  const initdb = join(bin, `initdb${extension}`);
  const pgCtl = join(bin, `pg_ctl${extension}`);
  await execFileAsync(initdb, ['-D', databaseDir, '-U', 'postgres', '-A', 'trust', '--encoding=UTF8', '--locale=C']);
  await spawnFile(pgCtl, ['-D', databaseDir, '-l', join(databaseDir, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start']);
  postgres = { stop: () => spawnFile(pgCtl, ['-D', databaseDir, '-m', 'fast', '-w', 'stop']) };
  process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  process.env.JWT_ACCESS_SECRET = 'integration-access-secret-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'integration-refresh-secret-at-least-32-characters';
  process.env.NODE_ENV = 'test';

  const db = await import('../src/db.ts');
  pool = db.pool;
  ensureSchema = db.ensureSchema;
  await ensureSchema();
  await pool.query(`INSERT INTO users(id,email,password_hash,name,account_kind) VALUES
      ($1,'owner-a@example.test','hash','Loja A','owner'),
      ($2,'owner-b@example.test','hash','Loja B','owner'),
      ($3,'operador-a@example.test','hash','Operador A','operator')`, [OWNER_A, OWNER_B, OPERATOR_A]);
  await pool.query(`INSERT INTO tenant_memberships(actor_id,user_id,role) VALUES
      ($1,$1,'OWNER'),($2,$2,'OWNER'),($3,$1,'OPERATOR')
      ON CONFLICT(actor_id) DO UPDATE SET user_id=excluded.user_id,role=excluded.role`, [OWNER_A, OWNER_B, OPERATOR_A]);
  await pool.query(`INSERT INTO business_settings(user_id,business_name,business_category,onboarding_completed)
      VALUES($1,'Loja A','varejo',true),($2,'Loja B','varejo',true)`, [OWNER_A, OWNER_B]);
  await pool.query(`INSERT INTO products(id,user_id,name,sale_price,cost_price,stock_quantity,minimum_quantity)
      VALUES($3,$1,'Produto A',10,5,10,1),($4,$2,'Produto B',20,8,7,1)`, [OWNER_A, OWNER_B, PRODUCT_A, PRODUCT_B]);
  await pool.query(`INSERT INTO cash_sessions(id,user_id,responsible,opening_balance,status)
      VALUES($2,$1,'Operador A',100,'open')`, [OWNER_A, SESSION_A]);
  await pool.query(`INSERT INTO auth_sessions(id,user_id,actor_id,expires_at) VALUES
      ($4,$1,$1,now()+interval '1 day'),($5,$1,$3,now()+interval '1 day'),($6,$2,$2,now()+interval '1 day')`,
    [OWNER_A, OWNER_B, OPERATOR_A, AUTH_OWNER_A, AUTH_OPERATOR_A, AUTH_OWNER_B]);

  const { hashPassword } = await import('../src/auth/password.ts');
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2', [await hashPassword('Operador123@'), OPERATOR_A]);
  const { signToken, signRefreshToken } = await import('../src/auth/jwt.ts');
  tokenOwnerA = signToken({ sub: OWNER_A, email: 'owner-a@example.test', ver: 0, role: 'client', tenantId: OWNER_A, tenantRole: 'OWNER', sid: AUTH_OWNER_A });
  tokenOwnerB = signToken({ sub: OWNER_B, email: 'owner-b@example.test', ver: 0, role: 'client', tenantId: OWNER_B, tenantRole: 'OWNER', sid: AUTH_OWNER_B });
  tokenOperatorA = signToken({ sub: OPERATOR_A, email: 'operador-a@example.test', ver: 0, role: 'client', tenantId: OWNER_A, tenantRole: 'OPERATOR', sid: AUTH_OPERATOR_A });
  refreshOperatorA = signRefreshToken({ sub: OPERATOR_A, email: 'operador-a@example.test', ver: 0, role: 'client', tenantId: OWNER_A, tenantRole: 'OPERATOR', sid: AUTH_OPERATOR_A });

  const [{ businessRouter }, { accountRouter }, { authRouter }] = await Promise.all([
    import('../src/business/routes.ts'), import('../src/account/routes.ts'), import('../src/auth/routes.ts'),
  ]);
  app = express();
  app.use(express.json());
  app.use('/api/business', businessRouter);
  app.use('/api/account', accountRouter);
  app.use('/api/auth', authRouter);
  app.use((error, _req, res, _next) => res.status(error.status ?? 500).json({ error: error.message, code: error.code }));
}, 120_000);

afterAll(async () => {
  if (pool) await pool.end();
  if (postgres) await postgres.stop();
  if (databaseDir) await rm(databaseDir, { recursive: true, force: true });
}, 30_000);

describe('operações de tenant no PostgreSQL', () => {
  it('nega ao operador configurações e backup reservados ao dono', async () => {
    await request(app).put('/api/business/settings').set(bearer(tokenOperatorA)).send({}).expect(403);
    await request(app).get('/api/account/backup').set(bearer(tokenOperatorA)).expect(403);
    await request(app).get('/api/account/backup').set(bearer(tokenOwnerA)).expect(200);
  });

  it('RLS e filtros impedem usar produto de outro tenant', async () => {
    await request(app).post('/api/business/sales').set(bearer(tokenOperatorA)).send({
      paymentMethod: 'dinheiro', items: [{ productId: PRODUCT_B, description: 'Produto B', quantity: 1, unitPrice: 20 }],
    }).expect(404);
    const result = await pool.query('SELECT stock_quantity FROM products WHERE id=$1', [PRODUCT_B]);
    expect(Number(result.rows[0].stock_quantity)).toBe(7);
    await request(app).get('/api/business/data').set(bearer(tokenOwnerB)).expect(200);
  });

  it('sincroniza uma venda uma vez, registra o operador e mantém estoque e auditoria', async () => {
    const clientSaleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const occurredAt = new Date().toISOString();
    const payload = {
      paymentMethod: 'dinheiro', clientSaleId, occurredAt, cashSessionId: SESSION_A, offline: true,
      expectedTenantId: OWNER_A, expectedActorId: OPERATOR_A,
      items: [{ productId: PRODUCT_A, description: 'Produto A', quantity: 2, unitPrice: 10 }],
    };
    const first = await request(app).post('/api/business/sales').set(bearer(tokenOperatorA)).send(payload).expect(201);
    expect(first.body.data.vendas).toHaveLength(1);
    expect(first.body.data.vendas[0].caixaSessaoId).toBe(SESSION_A);
    expect(first.body.data.contas).toEqual([]);
    const duplicate = await request(app).post('/api/business/sales').set(bearer(tokenOperatorA)).send(payload).expect(200);
    expect(duplicate.body.sale).toMatchObject({ id: first.body.sale.id, duplicate: true });
    const stock = await pool.query('SELECT stock_quantity FROM products WHERE id=$1', [PRODUCT_A]);
    expect(Number(stock.rows[0].stock_quantity)).toBe(8);
    const sale = await pool.query('SELECT actor_id,actor_name FROM sales WHERE id=$1', [first.body.sale.id]);
    expect(sale.rows[0]).toMatchObject({ actor_id: OPERATOR_A, actor_name: 'operador-a@example.test' });
    const audit = await pool.query("SELECT actor_id,actor_role FROM admin_audit_logs WHERE user_id=$1 AND action='business.post'", [OWNER_A]);
    expect(audit.rows.some((row) => row.actor_id === OPERATOR_A && row.actor_role === 'OPERATOR')).toBe(true);

    const item = await pool.query('SELECT id FROM sale_items WHERE sale_id=$1', [first.body.sale.id]);
    const returned = await request(app).post(`/api/business/sales/${first.body.sale.id}/returns`).set(bearer(tokenOperatorA)).send({
      itemId: item.rows[0].id, quantity: 1, reason: 'Cliente devolveu', confirmationId: first.body.sale.id,
    });
    expect(returned.status, JSON.stringify(returned.body)).toBe(200);
    expect(Number((await pool.query('SELECT stock_quantity FROM products WHERE id=$1', [PRODUCT_A])).rows[0].stock_quantity)).toBe(9);
    expect(Number((await pool.query('SELECT amount FROM transactions WHERE sale_id=$1', [first.body.sale.id])).rows[0].amount)).toBe(10);

    await request(app).post(`/api/business/sales/${first.body.sale.id}/cancel`).set(bearer(tokenOperatorA)).send({
      reason: 'Cancelamento solicitado', confirmationId: first.body.sale.id,
    }).expect(200);
    expect(Number((await pool.query('SELECT stock_quantity FROM products WHERE id=$1', [PRODUCT_A])).rows[0].stock_quantity)).toBe(10);
    expect((await pool.query('SELECT id FROM transactions WHERE sale_id=$1', [first.body.sale.id])).rowCount).toBe(0);
    const actions = (await pool.query('SELECT action FROM admin_audit_logs WHERE user_id=$1', [OWNER_A])).rows.map((row) => row.action);
    expect(actions).toEqual(expect.arrayContaining(['sale.item_returned', 'sale.cancelled']));
  });

  it('trava por inatividade no servidor e libera somente com a senha do ator', async () => {
    await pool.query("UPDATE auth_sessions SET last_activity_at=now()-interval '16 minutes' WHERE id=$1", [AUTH_OPERATOR_A]);
    await request(app).get('/api/business/data').set(bearer(tokenOperatorA)).expect(423);
    const refreshed = await request(app).post('/api/auth/refresh')
      .set('Cookie', `mnb_refresh_token=${refreshOperatorA}`).expect(200);
    expect(refreshed.body).toMatchObject({ locked: true });
    expect(refreshed.body.data).toBeUndefined();
    await request(app).post('/api/auth/session/unlock').set('Cookie', `mnb_refresh_token=${refreshOperatorA}`)
      .send({ password: 'errada' }).expect(401);
    const unlocked = await request(app).post('/api/auth/session/unlock').set('Cookie', `mnb_refresh_token=${refreshOperatorA}`)
      .send({ password: 'Operador123@' }).expect(200);
    expect(unlocked.body.data).toBeTruthy();
    await request(app).get('/api/business/data').set(bearer(tokenOperatorA)).expect(200);
  });

  it('não reintroduz PII anonimizada nem aceita consentimento vindo do backup', async () => {
    const customerId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    await pool.query(`INSERT INTO customers(id,user_id,name,anonymized_at)
      VALUES($1,$2,'Cliente anonimizado',now())`, [customerId, OWNER_A]);
    await pool.query('INSERT INTO privacy_erasure_tombstones(user_id,customer_id) VALUES($1,$2)', [OWNER_A, customerId]);
    const exported = await request(app).get('/api/account/backup').set(bearer(tokenOwnerA)).expect(200);
    expect(exported.body.version).toBe(3);
    const customer = exported.body.tables.customers.find((row) => row.id === customerId);
    Object.assign(customer, {
      name: 'Nome recuperado indevidamente', phone: '11999999999', email: 'pessoa@example.test', notes: 'PII',
      anonymized_at: null, whatsapp_consent_at: new Date().toISOString(),
      whatsapp_consent_version: 'whatsapp-charge-2026-09-05.1', whatsapp_consent_recorded_by: OWNER_A,
    });
    await request(app).put('/api/account/backup').set(bearer(tokenOwnerA)).send(exported.body).expect(204);
    const restored = await pool.query(`SELECT name,phone,email,notes,anonymized_at,whatsapp_consent_at
      FROM customers WHERE id=$1`, [customerId]);
    expect(restored.rows[0]).toMatchObject({ name: 'Cliente anonimizado', phone: null, email: null, notes: null, whatsapp_consent_at: null });
    expect(restored.rows[0].anonymized_at).toBeTruthy();
  });

  it('reaplica o schema quando a auditoria já contém ações com namespace', async () => {
    const before = await pool.query("SELECT count(1)::int AS total FROM admin_audit_logs WHERE action='business.post'");
    expect(before.rows[0].total).toBeGreaterThan(0);
    await expect(ensureSchema()).resolves.toBeUndefined();
    const after = await pool.query("SELECT count(1)::int AS total FROM admin_audit_logs WHERE action='business.post'");
    expect(after.rows[0].total).toBe(before.rows[0].total);
  });
});
