import { Router, type NextFunction, type Request, type Response } from 'express';
import { pool, withTenantTransaction } from '../db.js';
import { verifyToken } from '../auth/jwt.js';
import { comparePassword, hashPassword, passwordValidationError } from '../auth/password.js';
import { rateLimit } from '../security.js';
import { authenticateAccessToken } from '../admin/authorization.js';
import { requireClient } from '../admin/requireAdmin.js';

export const accountRouter = Router();
accountRouter.use(authenticateAccessToken);
accountRouter.use(requireClient);
const sensitiveAccountLimit = rateLimit('account-sensitive', 10, 15 * 60 * 1000);
const BACKUP_FORMAT = 'caixafacil-postgres-backup';
const BACKUP_VERSION = 2;
const RESTORE_COLUMNS: Record<string, string[]> = {
  business_settings: ['user_id', 'business_name', 'business_category', 'offering', 'controls_stock', 'daily_sales_goal', 'report_frequency', 'report_by_email', 'report_email', 'view_period', 'onboarding_completed', 'created_at', 'updated_at'],
  categories: ['id', 'user_id', 'name', 'created_at', 'updated_at'],
  products: ['id', 'user_id', 'category_id', 'kind', 'name', 'barcode', 'sale_price', 'cost_price', 'stock_quantity', 'minimum_quantity', 'service_duration', 'active', 'created_at', 'updated_at'],
  customers: ['id', 'user_id', 'name', 'phone', 'email', 'notes', 'created_at', 'updated_at'],
  cash_sessions: ['id', 'user_id', 'responsible', 'opened_at', 'closed_at', 'opening_balance', 'closing_balance', 'expected_balance', 'status', 'notes', 'created_at', 'updated_at'],
  sales: ['id', 'user_id', 'cash_session_id', 'customer_id', 'description', 'payment_method', 'status', 'total_amount', 'sold_at', 'cancelled_at', 'created_at', 'updated_at'],
  sale_items: ['id', 'user_id', 'sale_id', 'product_id', 'product_name', 'quantity', 'unit_price', 'unit_cost', 'created_at'],
  fixed_expenses: ['id', 'user_id', 'description', 'amount', 'recurrence', 'starts_on', 'ends_on', 'next_due_date', 'due_day', 'active', 'created_at', 'updated_at'],
  credit_sales: ['id', 'user_id', 'sale_id', 'customer_id', 'amount', 'paid_amount', 'status', 'due_date', 'paid_at', 'created_at', 'updated_at'],
  transactions: ['id', 'user_id', 'cash_session_id', 'sale_id', 'fixed_expense_id', 'credit_sale_id', 'type', 'source', 'payment_method', 'amount', 'description', 'movement_kind', 'entry_kind', 'expense_kind', 'identification_pending', 'occurred_at', 'created_at'],
};
const BACKUP_TABLES = Object.keys(RESTORE_COLUMNS);
const DELETE_ORDER = [
  'transactions', 'credit_sales', 'sale_items', 'sales', 'cash_sessions',
  'fixed_expenses', 'products', 'categories', 'customers', 'business_settings',
];

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function authenticatedUserId(req: Request): string | null {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    return verifyToken(token).sub;
  } catch {
    return null;
  }
}

accountRouter.delete('/data', sensitiveAccountLimit, asyncRoute(async (req, res) => {
  const userId = authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Token inválido ou expirado.' });

  await withTenantTransaction(userId, async (client) => {
    // Ordem determinada pelas FKs. A conta em users nao e removida, portanto
    // e-mail, hash da senha e capacidade de login permanecem intactos.
    for (const table of DELETE_ORDER) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }
  });

  return res.status(204).send();
}));

accountRouter.get('/backup', sensitiveAccountLimit, asyncRoute(async (req, res) => {
  const userId = authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Token inválido ou expirado.' });

  const tables = await withTenantTransaction(userId, async (client) => {
    const result: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      const rows = await client.query(`SELECT * FROM ${table} WHERE user_id = $1`, [userId]);
      result[table] = rows.rows;
    }
    return result;
  });

  return res.json({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    tables,
  });
}));

accountRouter.put('/backup', sensitiveAccountLimit, asyncRoute(async (req, res) => {
  const userId = authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Token inválido ou expirado.' });
  const backup = req.body;
  if (!backup || backup.format !== BACKUP_FORMAT || backup.version !== BACKUP_VERSION || !backup.tables) {
    return res.status(400).json({ error: 'Arquivo inválido ou versão de backup não suportada.' });
  }

  for (const table of BACKUP_TABLES) {
    if (!Array.isArray(backup.tables[table])) {
      return res.status(400).json({ error: `O backup não contém a tabela ${table}.` });
    }
    if (backup.tables[table].some((row: unknown) =>
      !row || typeof row !== 'object' || (row as Record<string, unknown>).user_id !== userId)) {
      return res.status(400).json({ error: 'O backup pertence a outra conta ou foi alterado.' });
    }
  }

  await withTenantTransaction(userId, async (client) => {
    for (const table of DELETE_ORDER) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }

    for (const table of BACKUP_TABLES) {
      let rows = backup.tables[table] as Record<string, unknown>[];
      if (!rows.length) continue;
      // A quitação do fiado é derivada das transactions por trigger. Restaurar
      // a cobrança como pendente e inserir o livro financeiro depois recompõe
      // os campos pagos sem permitir uma dívida quitada sem receita associada.
      if (table === 'credit_sales') {
        rows = rows.map((row) => ({ ...row, paid_amount: 0, status: 'pendente', paid_at: null }));
      }
      const columns = RESTORE_COLUMNS[table];
      const quotedColumns = columns.map((column) => `"${column}"`).join(', ');
      await client.query(
        `INSERT INTO ${table} (${quotedColumns})
         SELECT ${quotedColumns}
         FROM jsonb_populate_recordset(NULL::${table}, $1::jsonb)`,
        [JSON.stringify(rows)],
      );
    }
  });

  return res.status(204).send();
}));

accountRouter.patch('/password', sensitiveAccountLimit, asyncRoute(async (req, res) => {
  const userId = authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Token inválido ou expirado.' });

  const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
  if (typeof currentPassword !== 'string' || !currentPassword) {
    return res.status(400).json({ error: 'Informe sua senha atual.' });
  }
  const passwordError = passwordValidationError(newPassword);
  if (passwordError) return res.status(400).json({ error: passwordError });
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'A confirmação da nova senha não confere.' });
  }

  const result = await pool.query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const account = result.rows[0];
  if (!account || !(await comparePassword(currentPassword, account.password_hash))) {
    return res.status(400).json({ error: 'A senha atual está incorreta.' });
  }
  if (await comparePassword(newPassword, account.password_hash)) {
    return res.status(400).json({ error: 'A nova senha precisa ser diferente da senha atual.' });
  }

  const passwordHash = await hashPassword(newPassword);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, userId]);
    await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  return res.json({ message: 'Senha alterada com sucesso.' });
}));
