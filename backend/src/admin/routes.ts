import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool } from '../db.js';
import { rateLimit } from '../security.js';
import { authenticateAccessToken, type AdminResponseLocals } from './authorization.js';
import { requireAdmin } from './requireAdmin.js';
import { loadAdminLevel, requireSuperadmin } from './access.js';
import { comparePassword, hashPassword, passwordValidationError } from '../auth/password.js';
import { getOperationalErrorSnapshot, simulateOperationalErrorSpike } from '../observability.js';
import { MAX_BUSINESSES_PER_OWNER } from '../businesses/config.js';

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

function periodDays(value: unknown): 7 | 30 | 90 {
  const days = Number(value ?? 30);
  if (days !== 7 && days !== 30 && days !== 90) {
    throw Object.assign(new Error('Período inválido. Use 7, 30 ou 90 dias.'), { status: 400 });
  }
  return days;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function optionalDate(value: unknown, endOfDay = false): string | null {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(new Date(`${text}T00:00:00.000Z`).getTime())) {
    throw Object.assign(new Error('Data inválida. Use AAAA-MM-DD.'), { status: 400 });
  }
  return `${text}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`;
}

function normalizedName(value: unknown): string {
  return String(value ?? '').trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

function clientDisplayName(row: Record<string, unknown>): string {
  return String(row.name ?? row.email ?? '');
}

function confirmationMatches(value: unknown, expected: string): boolean {
  return normalizedName(value) === normalizedName(expected);
}

function adminActorRole(res: Response<unknown, AdminResponseLocals>): 'SUPPORT' | 'SUPERADMIN' {
  return res.locals.adminLevel === 'SUPPORT' ? 'SUPPORT' : 'SUPERADMIN';
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

function safeAuditDetails(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const allowed = ['previousStatus', 'newStatus', 'scope', 'changedFields', 'sessionsRevoked',
    'previousRole', 'resultingRole', 'businessStatus', 'simulated'];
  return Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
}

function auditFilter(value: unknown, label: string): string {
  const text = String(value ?? '').trim();
  if (text.length > 100) throw Object.assign(new Error(`${label} aceita no máximo 100 caracteres.`), { status: 400 });
  return text;
}

export const adminRouter = Router();
const adminReadLimit = rateLimit('admin-read', 120, 15 * 60 * 1000);
const adminWriteLimit = rateLimit('admin-write', 30, 15 * 60 * 1000);

adminRouter.use(authenticateAccessToken, requireAdmin, loadAdminLevel);

adminRouter.get('/stats', adminReadLimit, asyncRoute(async (req, res) => {
  const days = periodDays(req.query.days);
  const [summary, series] = await Promise.all([
    pool.query(
      `WITH owner_accounts AS (
         SELECT u.id,u.status,u.created_at,COUNT(b.id) FILTER(WHERE b.archived_at IS NULL)::int AS business_count
         FROM users u LEFT JOIN businesses b ON b.owner_user_id=u.id
         WHERE u.role='client' AND u.account_kind='owner'
         GROUP BY u.id
       )
       SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER(WHERE status='active')::int AS active,
         COUNT(*) FILTER(WHERE status='suspended')::int AS suspended,
         COUNT(*) FILTER(WHERE created_at>=now()-($1::int*interval '1 day'))::int AS new_period,
         COALESCE((SELECT COUNT(*) FROM businesses WHERE archived_at IS NULL),0)::int AS businesses,
         COUNT(*) FILTER(WHERE business_count=1)::int AS accounts_one_business,
         COUNT(*) FILTER(WHERE business_count=2)::int AS accounts_two_businesses,
         COUNT(*) FILTER(WHERE business_count>=3)::int AS accounts_three_businesses,
         ROUND(100.0*COUNT(*) FILTER(WHERE business_count>1)/NULLIF(COUNT(*),0),1) AS multi_business_percent,
         ROUND(100.0*COUNT(*) FILTER(WHERE EXISTS(
           SELECT 1 FROM business_memberships bm WHERE bm.user_id=owner_accounts.id AND bm.role='OWNER'
             AND EXISTS(SELECT 1 FROM business_memberships op WHERE op.business_id=bm.business_id AND op.role='OPERATOR' AND op.active)
         ))/NULLIF(COUNT(*),0),1) AS operators_percent,
         ROUND(100.0*COUNT(*) FILTER(WHERE EXISTS(
           SELECT 1 FROM customers c JOIN businesses b ON b.id=c.business_id
           WHERE b.owner_user_id=owner_accounts.id AND c.whatsapp_consent_at IS NOT NULL AND c.anonymized_at IS NULL
         ))/NULLIF(COUNT(*),0),1) AS whatsapp_percent,
         ROUND(100.0*COUNT(*) FILTER(WHERE EXISTS(
           SELECT 1 FROM sales s JOIN businesses b ON b.id=s.business_id
           WHERE b.owner_user_id=owner_accounts.id AND s.client_sale_id IS NOT NULL
         ))/NULLIF(COUNT(*),0),1) AS offline_percent
       FROM owner_accounts`,
      [days],
    ),
    pool.query(
      `WITH bounds AS (
         SELECT CASE WHEN $1::int=7 THEN 'day' WHEN $1::int=30 THEN 'week' ELSE 'month' END AS bucket,
           now()-($1::int*interval '1 day') AS starts
       )
       SELECT date_trunc(bounds.bucket,u.created_at)::date AS period,COUNT(*)::int AS total
       FROM users u CROSS JOIN bounds
       WHERE u.role='client' AND u.account_kind='owner' AND u.created_at>=bounds.starts
       GROUP BY bounds.bucket,date_trunc(bounds.bucket,u.created_at)
       ORDER BY period`,
      [days],
    ),
  ]);
  const row = summary.rows[0];
  return res.json({
    periodDays: days,
    total: row.total,
    active: row.active,
    suspended: row.suspended,
    newInPeriod: row.new_period,
    businesses: row.businesses,
    distribution: { one: row.accounts_one_business, two: row.accounts_two_businesses, three: row.accounts_three_businesses },
    adoption: {
      multiBusinessPercent: Number(row.multi_business_percent ?? 0),
      whatsappConsentPercent: Number(row.whatsapp_percent ?? 0),
      operatorsPercent: Number(row.operators_percent ?? 0),
      offlineQueuePercent: Number(row.offline_percent ?? 0),
    },
    newAccountsSeries: series.rows.map((item) => ({
      period: item.period instanceof Date
        ? item.period.toISOString().slice(0, 10)
        : String(item.period).slice(0, 10),
      total: item.total,
    })),
  });
}));

export const adminProfileHandler: AsyncRoute = async (_req, res) => {
  const result = await pool.query(
    `SELECT id, email, name, admin_level, created_at FROM users WHERE id = $1 AND role = 'admin'`,
    [res.locals.auth!.sub],
  );
  if (!result.rowCount) return res.status(404).json({ error: 'Conta administrativa não encontrada.' });
  const profile = result.rows[0];
  return res.json({
    id: profile.id,
    email: profile.email,
    name: profile.name ?? profile.email,
    adminLevel: profile.admin_level,
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
      `INSERT INTO admin_audit_logs (admin_user_id, actor_id, actor_role, target_user_id, action, details)
       VALUES ($1, $1, $2, $1, 'admin_name_updated', $3::jsonb)`,
      [adminId, adminActorRole(res), JSON.stringify({ changedFields: ['name'] })],
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
      `INSERT INTO admin_audit_logs (admin_user_id, actor_id, actor_role, target_user_id, action, details)
       VALUES ($1, $1, $2, $1, 'admin_password_changed', '{}'::jsonb)`,
      [adminId, adminActorRole(res)],
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
  const where = `u.role = 'client' AND u.account_kind = 'owner'
    AND ($1 = '' OR u.email ILIKE '%' || $1 || '%' OR COALESCE(u.name, '') ILIKE '%' || $1 || '%'
      OR EXISTS(SELECT 1 FROM businesses searched WHERE searched.owner_user_id=u.id AND searched.name ILIKE '%' || $1 || '%'))
    AND ($2 = 'all' OR u.status = $2)`;
  const [itemsResult, countResult] = await Promise.all([
    pool.query(
      `SELECT u.id, u.email, u.name, u.status, u.created_at,
              COUNT(b.id)::int AS business_count,
              COUNT(b.id) FILTER(WHERE b.archived_at IS NULL)::int AS active_business_count
       FROM users u
       LEFT JOIN businesses b ON b.owner_user_id=u.id
       WHERE ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC, u.id DESC
       LIMIT $3 OFFSET $4`,
      params,
    ),
    pool.query(
      `SELECT COUNT(*)::integer AS total
       FROM users u
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
      businessName: row.name ?? row.email,
      businessCount: row.business_count,
      activeBusinessCount: row.active_business_count,
      availableBusinessSlots: Math.max(0, MAX_BUSINESSES_PER_OWNER - Number(row.active_business_count)),
      maxBusinesses: MAX_BUSINESSES_PER_OWNER,
      status: row.status,
      createdAt: new Date(row.created_at).toISOString(),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
};
adminRouter.get('/clients', adminReadLimit, asyncRoute(listClientsHandler));

export const clientDetailHandler: AsyncRoute = async (req, res) => {
  if (!uuidPattern.test(req.params.id)) return res.status(400).json({ error: 'Identificador da conta inválido.' });
  const [result, businessesResult] = await Promise.all([
    pool.query(
      `SELECT u.id,u.email,u.name,u.status,u.created_at,u.updated_at
       FROM users u WHERE u.id=$1 AND u.role='client' AND u.account_kind='owner'`,
      [req.params.id],
    ),
    pool.query(
      `SELECT b.id,b.name,b.category,b.offering,b.created_at,b.archived_at,
              COUNT(m.user_id) FILTER(WHERE m.role='OPERATOR' AND m.active)::int AS operator_count
       FROM businesses b
       LEFT JOIN business_memberships m ON m.business_id=b.id
       WHERE b.owner_user_id=$1
       GROUP BY b.id
       ORDER BY b.archived_at NULLS FIRST,b.created_at,b.id`,
      [req.params.id],
    ),
  ]);
  if (!result.rowCount) return res.status(404).json({ error: 'Conta não encontrada.' });
  const row = result.rows[0];
  return res.json({
    id: row.id,
    email: row.email,
    name: row.name,
    businessName: row.name ?? row.email,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    businessCount: businessesResult.rows.length,
    activeBusinessCount: businessesResult.rows.filter((business) => !business.archived_at).length,
    availableBusinessSlots: Math.max(0, MAX_BUSINESSES_PER_OWNER - businessesResult.rows.filter((business) => !business.archived_at).length),
    maxBusinesses: MAX_BUSINESSES_PER_OWNER,
    businesses: businessesResult.rows.map((business) => ({
      id: business.id,
      name: business.name,
      category: business.category,
      offering: business.offering,
      status: business.archived_at ? 'archived' : 'active',
      createdAt: new Date(business.created_at).toISOString(),
      operatorCount: business.operator_count,
    })),
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
       FROM users u LEFT JOIN LATERAL (SELECT settings.* FROM business_settings settings JOIN businesses b ON b.id=settings.business_id WHERE b.owner_user_id=u.id AND b.archived_at IS NULL ORDER BY b.created_at,b.id LIMIT 1) bs ON true
       WHERE u.id = $1 AND u.role = 'client' AND u.account_kind = 'owner' FOR UPDATE OF u`,
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
      `INSERT INTO admin_audit_logs (admin_user_id, actor_id, actor_role, target_user_id, action, details)
       VALUES ($1, $1, $2, $3, $4, $5::jsonb)`,
      [adminId, adminActorRole(res), req.params.id, status === 'active' ? 'client_activated' : 'client_suspended', JSON.stringify({ previousStatus: current.status, newStatus: status, scope: 'account_and_all_businesses' })],
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
adminRouter.patch('/clients/:id/status', adminWriteLimit, requireSuperadmin, asyncRoute(updateClientStatusHandler));

export const updateClientNameHandler: AsyncRoute = async (req, res) => {
  const name = newAccountName(req.body?.name);
  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT u.id, u.email, u.name, bs.business_name
       FROM users u LEFT JOIN LATERAL (SELECT settings.* FROM business_settings settings JOIN businesses b ON b.id=settings.business_id WHERE b.owner_user_id=u.id AND b.archived_at IS NULL ORDER BY b.created_at,b.id LIMIT 1) bs ON true
       WHERE u.id = $1 AND u.role = 'client' AND u.account_kind = 'owner' FOR UPDATE OF u`,
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
      `INSERT INTO admin_audit_logs (admin_user_id, actor_id, actor_role, target_user_id, action, details)
       VALUES ($1, $1, $2, $3, 'client_name_updated', $4::jsonb)`,
      [adminId, adminActorRole(res), req.params.id, JSON.stringify({ changedFields: ['name'] })],
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
adminRouter.patch('/clients/:id/name', adminWriteLimit, requireSuperadmin, asyncRoute(updateClientNameHandler));

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
       FROM users u LEFT JOIN LATERAL (SELECT settings.* FROM business_settings settings JOIN businesses b ON b.id=settings.business_id WHERE b.owner_user_id=u.id AND b.archived_at IS NULL ORDER BY b.created_at,b.id LIMIT 1) bs ON true
       WHERE u.id = $1 AND u.role = 'client' AND u.account_kind = 'owner' FOR UPDATE OF u`,
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
      `INSERT INTO admin_audit_logs (admin_user_id, actor_id, actor_role, target_user_id, action, details)
       VALUES ($1, $1, $2, $3, 'client_password_reset', $4::jsonb)`,
      [adminId, adminActorRole(res), req.params.id, JSON.stringify({ sessionsRevoked: true })],
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
       FROM users u LEFT JOIN LATERAL (SELECT settings.* FROM business_settings settings JOIN businesses b ON b.id=settings.business_id WHERE b.owner_user_id=u.id AND b.archived_at IS NULL ORDER BY b.created_at,b.id LIMIT 1) bs ON true
       WHERE u.id = $1 AND u.role = 'client' AND u.account_kind = 'owner' FOR UPDATE OF u`,
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
      `INSERT INTO admin_audit_logs (admin_user_id, actor_id, actor_role, target_user_id, action, details)
       VALUES ($1, $1, $2, $3, 'client_deleted', $4::jsonb)`,
      [adminId, adminActorRole(res), req.params.id, JSON.stringify({ previousStatus: current.status, scope: 'account_and_all_businesses' })],
    );
    await client.query(`DELETE FROM users WHERE id = $1 AND role = 'client' AND account_kind = 'owner'`, [req.params.id]);
    await client.query('COMMIT');
    return res.status(204).send();
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.delete('/clients/:id', adminWriteLimit, requireSuperadmin, asyncRoute(deleteClientHandler));

export const updateBusinessStatusHandler: AsyncRoute = async (req, res) => {
  const { id: ownerId, businessId } = req.params;
  if (!uuidPattern.test(ownerId) || !uuidPattern.test(businessId)) {
    return res.status(400).json({ error: 'Identificador inválido.' });
  }
  const status = String(req.body?.status ?? '');
  if (status !== 'active' && status !== 'archived') return res.status(400).json({ error: 'Informe active ou archived.' });
  const adminId = res.locals.auth!.sub;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(
      `SELECT b.id,b.name,b.archived_at,u.status AS owner_status
       FROM businesses b JOIN users u ON u.id=b.owner_user_id
       WHERE b.id=$1 AND b.owner_user_id=$2 FOR UPDATE OF b`,
      [businessId, ownerId],
    );
    if (!result.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Negócio não encontrado nesta conta.' });
    }
    const business = result.rows[0];
    if (!confirmationMatches(req.body?.confirmationName, String(business.name))) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome do negócio exatamente como exibido para confirmar.' });
    }
    if (status === 'archived') {
      const activeCount = await client.query(
        `SELECT COUNT(*)::int AS total FROM businesses WHERE owner_user_id=$1 AND archived_at IS NULL`, [ownerId],
      );
      if (Number(activeCount.rows[0].total) <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A conta precisa manter um negócio ativo. Suspenda a conta para bloquear todo o acesso.' });
      }
      await client.query(`UPDATE businesses SET archived_at=now(),updated_at=now() WHERE id=$1`, [businessId]);
      await client.query(`UPDATE business_memberships SET active=false WHERE business_id=$1`, [businessId]);
      await client.query(`DELETE FROM auth_sessions WHERE business_id=$1`, [businessId]);
    } else {
      const activeCount = await client.query(
        `SELECT COUNT(*)::int AS total FROM businesses WHERE owner_user_id=$1 AND archived_at IS NULL`, [ownerId],
      );
      if (Number(activeCount.rows[0].total) >= MAX_BUSINESSES_PER_OWNER) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A conta já atingiu o limite de negócios ativos.' });
      }
      await client.query(`UPDATE businesses SET archived_at=NULL,updated_at=now() WHERE id=$1`, [businessId]);
      await client.query(`UPDATE business_memberships SET active=true WHERE business_id=$1 AND role='OWNER'`, [businessId]);
    }
    await client.query(
      `INSERT INTO admin_audit_logs(admin_user_id,actor_id,actor_role,target_user_id,business_id,action,details)
       VALUES($1,$1,'SUPERADMIN',$2,$3,$4,$5::jsonb)`,
      [adminId, ownerId, businessId, status === 'archived' ? 'business_archived_by_admin' : 'business_reactivated_by_admin',
        JSON.stringify({ businessStatus: status, scope: 'single_business' })],
    );
    await client.query('COMMIT');
    return res.json({ id: businessId, status });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/clients/:id/businesses/:businessId/status', adminWriteLimit, requireSuperadmin, asyncRoute(updateBusinessStatusHandler));

export const listAuditHandler: AsyncRoute = async (req, res) => {
  const page = pageNumber(req.query.page);
  const actor = auditFilter(req.query.actor, 'O filtro de ator');
  const action = auditFilter(req.query.action, 'O filtro de ação');
  const target = auditFilter(req.query.target, 'O filtro de alvo');
  const from = optionalDate(req.query.from);
  const to = optionalDate(req.query.to, true);
  if (from && to && from > to) return res.status(400).json({ error: 'A data inicial deve ser anterior à data final.' });
  const pageSize = 25;
  const offset = (page - 1) * pageSize;
  const params = [actor, action, target, from, to, pageSize, offset];
  const where = `($1='' OR COALESCE(actor.name,'') ILIKE '%'||$1||'%' OR logs.actor_id::text=$1)
    AND ($2='' OR logs.action=$2)
    AND ($3='' OR COALESCE(target.name,'') ILIKE '%'||$3||'%' OR COALESCE(b.name,'') ILIKE '%'||$3||'%'
      OR logs.target_user_id::text=$3 OR logs.business_id::text=$3)
    AND ($4::timestamptz IS NULL OR logs.created_at >= $4::timestamptz)
    AND ($5::timestamptz IS NULL OR logs.created_at <= $5::timestamptz)`;
  const [items, count] = await Promise.all([
    pool.query(
      `SELECT logs.id,logs.actor_id,logs.actor_role,logs.target_user_id,logs.business_id,logs.action,logs.details,logs.created_at,
              COALESCE(actor.name,'Ator removido') AS actor_name,
              COALESCE(target.name,'Conta removida') AS target_name,b.name AS business_name
       FROM admin_audit_logs logs
       LEFT JOIN users actor ON actor.id=logs.actor_id
       LEFT JOIN users target ON target.id=logs.target_user_id
       LEFT JOIN businesses b ON b.id=logs.business_id
       WHERE ${where} ORDER BY logs.created_at DESC,logs.id DESC LIMIT $6 OFFSET $7`, params,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM admin_audit_logs logs
       LEFT JOIN users actor ON actor.id=logs.actor_id LEFT JOIN users target ON target.id=logs.target_user_id
       LEFT JOIN businesses b ON b.id=logs.business_id WHERE ${where}`, params.slice(0, 5),
    ),
  ]);
  const total = Number(count.rows[0].total);
  return res.json({
    items: items.rows.map((row) => ({
      id: row.id, actorId: row.actor_id, actorName: row.actor_name, actorRole: row.actor_role,
      targetUserId: row.target_user_id, targetName: row.target_name, businessId: row.business_id,
      businessName: row.business_name, action: row.action, details: safeAuditDetails(row.details),
      createdAt: new Date(row.created_at).toISOString(),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  });
};
adminRouter.get('/audit', adminReadLimit, asyncRoute(listAuditHandler));

export const listAdminsHandler: AsyncRoute = async (_req, res) => {
  const result = await pool.query(
    `SELECT id,name,email,status,admin_level,created_at FROM users WHERE role='admin' ORDER BY created_at,id`,
  );
  return res.json({ items: result.rows.map((row) => ({
    id: row.id, name: row.name ?? row.email, email: row.email, status: row.status,
    adminLevel: row.admin_level, createdAt: new Date(row.created_at).toISOString(),
  })) });
};
adminRouter.get('/admins', adminReadLimit, requireSuperadmin, asyncRoute(listAdminsHandler));

export const updateAdminLevelHandler: AsyncRoute = async (req, res) => {
  const targetId = String(req.params.id);
  const level = String(req.body?.level ?? '');
  if (!uuidPattern.test(targetId)) return res.status(400).json({ error: 'Identificador do administrador inválido.' });
  if (!['SUPPORT','SUPERADMIN','REVOKED'].includes(level)) return res.status(400).json({ error: 'Nível administrativo inválido.' });
  const adminId = res.locals.auth!.sub;
  if (targetId === adminId) return res.status(409).json({ error: 'Outro superadministrador deve alterar o seu acesso.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const currentResult = await client.query(
      `SELECT id,name,email,admin_level FROM users WHERE id=$1 AND role='admin' FOR UPDATE`, [targetId],
    );
    if (!currentResult.rowCount) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Administrador não encontrado.' });
    }
    const current = currentResult.rows[0];
    const displayName = String(current.name ?? current.email);
    if (!confirmationMatches(req.body?.confirmationName, displayName)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Digite o nome do administrador exatamente como exibido para confirmar.' });
    }
    if (current.admin_level === 'SUPERADMIN' && level !== 'SUPERADMIN') {
      const remaining = await client.query(
        `SELECT COUNT(*)::int AS total FROM users
         WHERE role='admin' AND status='active' AND admin_level='SUPERADMIN'`,
      );
      if (Number(remaining.rows[0].total) <= 1) {
        await client.query('ROLLBACK');
        return res.status(409).json({ error: 'A plataforma precisa manter ao menos um superadministrador ativo.' });
      }
    }
    await client.query(
      `UPDATE users SET admin_level=$2,status=CASE WHEN $2='REVOKED' THEN 'suspended' ELSE 'active' END,
        token_version=token_version+1,updated_at=now() WHERE id=$1`, [targetId, level],
    );
    await client.query(`DELETE FROM auth_sessions WHERE actor_id=$1`, [targetId]);
    await client.query(
      `INSERT INTO admin_audit_logs(admin_user_id,actor_id,actor_role,target_user_id,action,details)
       VALUES($1,$1,'SUPERADMIN',$2,'admin_level_changed',$3::jsonb)`,
      [adminId, targetId, JSON.stringify({ previousRole: current.admin_level, resultingRole: level, sessionsRevoked: true })],
    );
    await client.query('COMMIT');
    return res.json({ id: targetId, adminLevel: level, status: level === 'REVOKED' ? 'suspended' : 'active' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};
adminRouter.patch('/admins/:id/level', adminWriteLimit, requireSuperadmin, asyncRoute(updateAdminLevelHandler));

export const simulateErrorSpikeHandler: AsyncRoute = async (req, res) => {
  const count = Number(req.body?.count ?? 5);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return res.status(400).json({ error: 'A simulação aceita entre 1 e 50 erros.' });
  }
  const snapshot = simulateOperationalErrorSpike(count);
  const adminId = res.locals.auth!.sub;
  await pool.query(
    `INSERT INTO admin_audit_logs(admin_user_id,actor_id,actor_role,target_user_id,action,details)
     VALUES($1,$1,'SUPERADMIN',$1,'operational_error_spike_simulated',$2::jsonb)`,
    [adminId, JSON.stringify({ simulated: true })],
  );
  return res.json(snapshot);
};
adminRouter.post('/operations/simulate-errors', adminWriteLimit, requireSuperadmin, asyncRoute(simulateErrorSpikeHandler));

adminRouter.get('/operations', adminReadLimit, asyncRoute(async (req, res) => {
  const staleHours = Math.max(1, Math.min(72, Number(req.query.staleHours ?? 4) || 4));
  const checkedAt = new Date();
  const [database, monitor, offline] = await Promise.all([
    pool.query('SELECT 1'),
    pool.query(`SELECT healthy,http_status,simulated,checked_at,received_at FROM platform_monitor_status WHERE monitor_name='api'`),
    pool.query(
      `SELECT COUNT(DISTINCT b.owner_user_id)::int AS accounts
       FROM offline_queue_status q JOIN businesses b ON b.id=q.business_id
       WHERE q.pending_count>0 AND q.oldest_pending_at < now()-($1::int*interval '1 hour')`, [staleHours],
    ),
  ]);
  void database;
  const lastMonitor = monitor.rows[0];
  return res.json({
    refreshedAt: checkedAt.toISOString(), refreshIntervalMinutes: 5,
    health: { ok: true, database: 'ready' },
    sentry: getOperationalErrorSnapshot(),
    uptime: lastMonitor ? {
      healthy: lastMonitor.healthy, httpStatus: lastMonitor.http_status, simulated: lastMonitor.simulated,
      checkedAt: new Date(lastMonitor.checked_at).toISOString(), receivedAt: new Date(lastMonitor.received_at).toISOString(),
    } : null,
    offlineQueues: { staleAfterHours: staleHours, accountsWithStalePending: offline.rows[0].accounts },
  });
}));
