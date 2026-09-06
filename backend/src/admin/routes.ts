import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { rateLimit } from '../security.js';
import { authenticateAccessToken, type AdminResponseLocals } from './authorization.js';
import { requireAdmin } from './requireAdmin.js';
import { comparePassword, hashPassword, passwordValidationError } from '../auth/password.js';

type AsyncRoute = (req: Request, res: Response<unknown, AdminResponseLocals>, next: NextFunction) => Promise<unknown>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response<unknown, AdminResponseLocals>, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function pageNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 100_000) : 1;
}

function searchText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (text.length > 100) throw Object.assign(new Error('A busca aceita no máximo 100 caracteres.'), { status: 400 });
  return text;
}

function accountStatus(value: unknown): 'all' | 'active' | 'suspended' {
  const status = String(value ?? 'all');
  if (status !== 'all' && status !== 'active' && status !== 'suspended') {
    throw Object.assign(new Error('Filtro de status inválido.'), { status: 400 });
  }
  return status;
}

function normalizedName(value: unknown): string {
  return String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

function clientDisplayName(row: Record<string, unknown>): string {
  return String(row.business_name ?? row.name ?? row.email ?? '');
}

function confirmationMatches(value: unknown, expected: string): boolean {
  return normalizedName(value) === normalizedName(expected);
}

function newAccountName(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length < 2) {
    throw Object.assign(new Error('O nome deve ter pelo menos 2 caracteres.'), { status: 400 });
  }
  const name = value.trim();
  if (name.length > 100) {
    throw Object.assign(new Error('O nome aceita no máximo 100 caracteres.'), { status: 400 });
  }
  return name;
}

export const adminRouter = Router();
const adminReadLimit = rateLimit('admin-read', 120, 15 * 60 * 1000);
const adminWriteLimit = rateLimit('admin-write', 30, 15 * 60 * 1000);

adminRouter.use(authenticateAccessToken, requireAdmin);

adminRouter.get('/stats', adminReadLimit, asyncRoute(async (_req, res) => {
  const result = await pool.query(
    `SELECT
       COUNT(*)::integer AS total,
       COUNT(*) FILTER (WHERE status = 'active')::integer AS active,
       COUNT(*) FILTER (WHERE status = 'suspended')::integer AS suspended,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::integer AS new_last_30_days
     FROM users WHERE role = 'client'`,
  );
  const row = result.rows[0];
  return res.json({
    total: row.total,
    active: row.active,
    suspended: row.suspended,
    newLast30Days: row.new_last_30_days,
  });
}));

export const adminProfileHandler: AsyncRoute = async (_req, res) => {
  const result = await pool.query(
    `SELECT id, email, name, created_at FROM users WHERE id = $1 AND role = 'admin'`,
    [res.locals.auth!.sub],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Conta administrativa não encontrada.' });
  const profile = result.rows[0];
  return res.json({
    id: profile.id,
    email: profile.email,
    name: profile.name ?? profile.email,
    createdAt: new Date(profile.created_at).toISOString(),
  });
};
adminRouter.get('/profile', adminReadLimit, asyncRoute(adminProfileHandler));

export const updateAdminNameHandler: AsyncRoute = async (req, res) => {
  const name = newAccountName(req.body?.name);
  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, email, name FROM users WHERE id = $1 AND role = 'admin' FOR UPDATE`,
      [adminId],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta administrativa não encontrada.' });
    }
    const current = currentResult.rows[0];
    const currentName = String(current.name ?? current.email);
    if (!confirmationMatches(req.body?.confirmationName, currentName)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome atual exatamente como exibido para confirmar.' });
    }
    await client.query(`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`, [adminId, name]);
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, target_user_id, action, details)
       VALUES ($1, $1, 'admin_name_updated', $2::jsonb)`,
      [adminId, JSON.stringify({ previousName: currentName, newName: name })],
    );
    await client.query('COMMIT');
    return res.json({ id: adminId, name });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/profile/name', adminWriteLimit, asyncRoute(updateAdminNameHandler));

export const changeAdminPasswordHandler: AsyncRoute = async (req, res) => {
  const { currentPassword, newPassword, confirmPassword, confirmationName } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ error: 'Informe sua senha atual.' });
  }
  const passwordError = passwordValidationError(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'A confirmação da nova senha não confere.' });
  }

  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id, email, name, password_hash FROM users WHERE id = $1 AND role = 'admin' FOR UPDATE`,
      [adminId],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Conta administrativa não encontrada.' });
    }
    const current = currentResult.rows[0];
    const currentName = String(current.name ?? current.email);
    if (!confirmationMatches(confirmationName, currentName)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome atual exatamente como exibido para confirmar.' });
    }
    if (!(await comparePassword(currentPassword, current.password_hash))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A senha atual está incorreta.' });
    }
    if (await comparePassword(newPassword, current.password_hash)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'A nova senha precisa ser diferente da senha atual.' });
    }
    const passwordHash = await hashPassword(newPassword);
    await client.query(`UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1`, [adminId, passwordHash]);
    await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [adminId]);
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, target_user_id, action, details)
       VALUES ($1, $1, 'admin_password_changed', '{}'::jsonb)`,
      [adminId],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Senha administrativa alterada com sucesso.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/profile/password', adminWriteLimit, asyncRoute(changeAdminPasswordHandler));

export const listClientsHandler: AsyncRoute = async (req, res) => {
  const page = pageNumber(req.query.page);
  const search = searchText(req.query.search);
  const status = accountStatus(req.query.status);
  const pageSize = 15;
  const offset = (page - 1) * pageSize;
  const params = [search, status, pageSize, offset];
  const where = `u.role = 'client'
    AND ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR COALESCE(bs.business_name, u.name, '') ILIKE '%' || $1 || '%')
    AND ($2 = 'all' OR u.status = $2)`;
  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT u.id, u.email, u.name, u.status, u.created_at, bs.business_name
       FROM users u
       LEFT JOIN business_settings bs ON bs.user_id = u.id
       WHERE ${where}
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT $3 OFFSET $4`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS total
       FROM users u
       LEFT JOIN business_settings bs ON bs.user_id = u.id
       WHERE ${where}`,
      [search, status],
    ),
  ]);
  const total = Number(countResult.rows[0].total);
  return res.json({
    items: itemsResult.rows.map((row) => ({
      id: row.id,
      email: row.email,
      name: row.name,
      businessName: row.business_name ?? row.name ?? 'Negócio sem nome',
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
};
adminRouter.get('/clients', adminReadLimit, asyncRoute(listClientsHandler));

export const clientDetailHandler: AsyncRoute = async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.email, u.name, u.status, u.created_at, u.updated_at,
            bs.business_name, bs.business_category, bs.offering, bs.onboarding_completed,
            (SELECT COUNT(*)::integer FROM products p WHERE p.user_id = u.id AND p.active) AS products,
            (SELECT COUNT(*)::integer FROM sales s WHERE s.user_id = u.id AND s.status = 'completed') AS sales,
            (SELECT COUNT(*)::integer FROM cash_sessions cs WHERE cs.user_id = u.id AND cs.status = 'closed') AS cash_closings,
            (SELECT COUNT(*)::integer FROM customers c WHERE c.user_id = u.id) AS customers,
            (SELECT COUNT(*)::integer FROM credit_sales cr WHERE cr.user_id = u.id AND cr.status <> 'pago') AS open_credits
     FROM users u
     LEFT JOIN business_settings bs ON bs.user_id = u.id
     WHERE u.id = $1 AND u.role = 'client'`,
    [req.params.id],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Cliente não encontrado.' });
  const row = result.rows[0];
  return res.json({
    id: row.id,
    email: row.email,
    name: row.name,
    businessName: row.business_name ?? row.name ?? 'Negócio sem nome',
    businessCategory: row.business_category,
    offering: row.offering,
    onboardingCompleted: Boolean(row.onboarding_completed),
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    usage: {
      products: row.products,
      sales: row.sales,
      cashClosings: row.cash_closings,
      customers: row.customers,
      openCredits: row.open_credits,
    },
  });
};
adminRouter.get('/clients/:id', adminReadLimit, asyncRoute(clientDetailHandler));

export const updateClientStatusHandler: AsyncRoute = async (req, res) => {
  const status = accountStatus(req.body?.status);
  if (status === 'all') return res.status(400).json({ error: 'Informe active ou suspended.' });
  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT u.id, u.email, u.name, u.status, bs.business_name
       FROM users u LEFT JOIN business_settings bs ON bs.user_id = u.id
       WHERE u.id = $1 AND u.role = 'client' FOR UPDATE OF u`,
      [req.params.id],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const current = currentResult.rows[0];
    if (!confirmationMatches(req.body?.confirmationName, clientDisplayName(current))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome do cliente exatamente como exibido para confirmar.' });
    }
    await client.query(
      `UPDATE users SET status = $2, token_version = token_version + 1, updated_at = now() WHERE id = $1`,
      [req.params.id, status],
    );
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, target_user_id, action, details)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [adminId, req.params.id, status === 'active' ? 'client_activated' : 'client_suspended', JSON.stringify({ email: current.email, previousStatus: current.status, newStatus: status })],
    );
    await client.query('COMMIT');
    return res.json({ id: req.params.id, status });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/clients/:id/status', adminWriteLimit, asyncRoute(updateClientStatusHandler));

export const updateClientNameHandler: AsyncRoute = async (req, res) => {
  const name = newAccountName(req.body?.name);
  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT u.id, u.email, u.name, bs.business_name
       FROM users u LEFT JOIN business_settings bs ON bs.user_id = u.id
       WHERE u.id = $1 AND u.role = 'client' FOR UPDATE OF u`,
      [req.params.id],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const current = currentResult.rows[0];
    const currentDisplayName = clientDisplayName(current);
    if (!confirmationMatches(req.body?.confirmationName, currentDisplayName)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome atual exatamente como exibido para confirmar.' });
    }
    await client.query(`UPDATE users SET name = $2, updated_at = now() WHERE id = $1`, [req.params.id, name]);
    await client.query(
      `UPDATE business_settings SET business_name = $2, updated_at = now() WHERE user_id = $1`,
      [req.params.id, name],
    );
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, target_user_id, action, details)
       VALUES ($1, $2, 'client_name_updated', $3::jsonb)`,
      [adminId, req.params.id, JSON.stringify({ email: current.email, previousName: currentDisplayName, newName: name })],
    );
    await client.query('COMMIT');
    return res.json({ id: req.params.id, name, businessName: name });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/clients/:id/name', adminWriteLimit, asyncRoute(updateClientNameHandler));

export const resetClientPasswordHandler: AsyncRoute = async (req, res) => {
  const { newPassword, confirmPassword, confirmationName } = req.body ?? {};
  const passwordError = passwordValidationError(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'A confirmação da nova senha não confere.' });
  }

  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT u.id, u.email, u.name, bs.business_name
       FROM users u LEFT JOIN business_settings bs ON bs.user_id = u.id
       WHERE u.id = $1 AND u.role = 'client' FOR UPDATE OF u`,
      [req.params.id],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const current = currentResult.rows[0];
    if (!confirmationMatches(confirmationName, clientDisplayName(current))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome do cliente exatamente como exibido para confirmar.' });
    }
    const passwordHash = await hashPassword(newPassword);
    await client.query(
      `UPDATE users
       SET password_hash = $2, token_version = token_version + 1, updated_at = now()
       WHERE id = $1`,
      [req.params.id, passwordHash],
    );
    await client.query(`DELETE FROM password_reset_tokens WHERE user_id = $1`, [req.params.id]);
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, target_user_id, action, details)
       VALUES ($1, $2, 'client_password_reset', $3::jsonb)`,
      [adminId, req.params.id, JSON.stringify({ email: current.email, sessionsRevoked: true })],
    );
    await client.query('COMMIT');
    return res.json({ message: 'Senha redefinida e sessões do cliente revogadas.' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/clients/:id/password', adminWriteLimit, asyncRoute(resetClientPasswordHandler));

export const deleteClientHandler: AsyncRoute = async (req, res) => {
  if (req.body?.confirm !== true) return res.status(400).json({ error: 'Confirme a exclusão da conta.' });
  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT u.id, u.email, u.name, u.status, bs.business_name
       FROM users u LEFT JOIN business_settings bs ON bs.user_id = u.id
       WHERE u.id = $1 AND u.role = 'client' FOR UPDATE OF u`,
      [req.params.id],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    const current = currentResult.rows[0];
    if (!confirmationMatches(req.body?.confirmationName, clientDisplayName(current))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome do cliente exatamente como exibido para confirmar.' });
    }
    await client.query(
      `INSERT INTO admin_audit_logs (admin_user_id, target_user_id, action, details)
       VALUES ($1, $2, 'client_deleted', $3::jsonb)`,
      [adminId, req.params.id, JSON.stringify({ email: current.email, name: current.name, businessName: current.business_name, status: current.status })],
    );
    await client.query(`DELETE FROM users WHERE id = $1 AND role = 'client'`, [req.params.id]);
    await client.query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.delete('/clients/:id', adminWriteLimit, asyncRoute(deleteClientHandler));
