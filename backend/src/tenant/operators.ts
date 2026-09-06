import crypto from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { authenticateAccessToken } from '../admin/authorization.js';
import { requireClient } from '../admin/requireAdmin.js';
import { requireTenantRole } from './authorization.js';
import { hashPassword, passwordValidationError } from '../auth/password.js';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
const asyncRoute = (handler: AsyncRoute) => (req: Request, res: Response, next: NextFunction) => {
  void handler(req, res, next).catch(next);
};
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const operatorRouter = Router();
operatorRouter.use(authenticateAccessToken, requireClient, requireTenantRole('OWNER'));

operatorRouter.get('/', asyncRoute(async (_req, res) => {
  const tenantId = res.locals.auth.tenantId!;
  const result = await pool.query(
    `SELECT u.id,u.name,u.email,m.active,m.created_at
     FROM business_memberships m JOIN users u ON u.id=m.user_id
     WHERE m.business_id=$1 AND m.role='OPERATOR' ORDER BY m.created_at DESC`, [tenantId]);
  return res.json({ operators: result.rows.map(row => ({
    id: row.id, name: row.name, email: row.email, active: row.active, createdAt: row.created_at,
  })) });
}));

operatorRouter.post('/', asyncRoute(async (req, res) => {
  const tenantId = res.locals.auth.tenantId!;
  const actorId = res.locals.auth.sub;
  const name = String(req.body?.name ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = req.body?.password;
  if (!name || name.length > 120) return res.status(400).json({ error: 'Nome do operador é obrigatório.' });
  if (!EMAIL_RE.test(email) || email.length > 254) return res.status(400).json({ error: 'E-mail inválido.' });
  const passwordError = passwordValidationError(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO users(id,email,name,password_hash,role,account_kind) VALUES($1,$2,$3,$4,\'client\',\'operator\')',
      [id, email, name, passwordHash]);
    await client.query(`INSERT INTO business_memberships(user_id,business_id,role) VALUES($1,$2,'OPERATOR')`, [id, tenantId]);
    await client.query(`INSERT INTO admin_audit_logs(business_id,actor_id,actor_role,target_user_id,action,details)
      VALUES($1,$2,'OWNER',$3,'operator.created',$4::jsonb)`,
      [tenantId, actorId, id, JSON.stringify({ name })]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    if (typeof error === 'object' && error && 'code' in error && error.code === '23505') {
      return res.status(409).json({ error: 'Este e-mail já está em uso.' });
    }
    throw error;
  } finally { client.release(); }
  return res.status(201).json({ operator: { id, name, email, active: true } });
}));

operatorRouter.patch('/:id/status', asyncRoute(async (req, res) => {
  const tenantId = res.locals.auth.tenantId!;
  const actorId = res.locals.auth.sub;
  const operatorId = String(req.params.id);
  const active = req.body?.active;
  if (typeof active !== 'boolean') return res.status(400).json({ error: 'Estado inválido.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`UPDATE business_memberships SET active=$3
      WHERE business_id=$1 AND user_id=$2 AND role='OPERATOR' RETURNING user_id`, [tenantId, operatorId, active]);
    if (!result.rowCount) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Operador não encontrado.' }); }
    if (!active) {
      await client.query('UPDATE users SET token_version=token_version+1 WHERE id=$1', [operatorId]);
      await client.query('DELETE FROM auth_sessions WHERE actor_id=$1 AND business_id=$2', [operatorId, tenantId]);
    }
    await client.query(`INSERT INTO admin_audit_logs(business_id,actor_id,actor_role,target_user_id,action,details)
      VALUES($1,$2,'OWNER',$3,$4,'{}')`, [tenantId, actorId, operatorId, active ? 'operator.activated' : 'operator.deactivated']);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  return res.json({ id: operatorId, active });
}));
