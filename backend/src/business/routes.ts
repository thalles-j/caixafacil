import { Router, type NextFunction, type Request, type Response } from 'express';
import { verifyToken } from '../auth/jwt.js';
import { withTenantTransaction } from '../db.js';
import { loadBootstrapData } from './bootstrap.js';
import { sendEmail } from '../email.js';
import { authenticateAccessToken } from '../admin/authorization.js';
import { requireClient } from '../admin/requireAdmin.js';
import { authorizeBusiness } from '../tenant/authorization.js';
import { auditTenant } from '../tenant/audit.js';
import crypto from 'node:crypto';
import { loadOperatorData } from '../tenant/data.js';

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;
type AuthenticatedUser = { id: string; actorId: string; email: string; tenantRole: 'OWNER' | 'OPERATOR' };

const PAYMENT_METHODS = new Set(['dinheiro', 'pix', 'cartao_credito', 'cartao_debito']);
const SALE_PAYMENT_METHODS = new Set([...PAYMENT_METHODS, 'fiado']);
const ENTRY_KINDS = new Set(['produto', 'servico', 'gorjeta']);
const EXPENSE_KINDS = new Set([
  'mercadoria',
  'fornecedor',
  'aluguel',
  'energia',
  'agua',
  'internet',
  'funcionario',
  'combustivel',
  'impostos',
  'outros',
]);
const FIXED_EXPENSE_RECURRENCES = new Set(['weekly', 'monthly']);
const PRODUCT_KINDS = new Set(['product', 'service']);
const OFFERINGS = new Set(['produtos', 'servicos', 'ambos']);
const REPORT_FREQUENCIES = new Set(['semanal', 'mensal', 'ambos', 'nenhum']);
const VIEW_PERIODS = new Set(['day', 'week']);

export const businessRouter = Router();
businessRouter.use(authenticateAccessToken, requireClient, authorizeBusiness);

function asyncRoute(handler: AsyncRoute) {
  return (req: Request, res: Response, next: NextFunction) => {
    void handler(req, res, next).catch(next);
  };
}

function authenticatedUser(req: Request): AuthenticatedUser | null {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  try {
    const payload = verifyToken(token);
    if (!payload.tenantId || !payload.tenantRole) return null;
    return { id: payload.tenantId, actorId: payload.sub, email: payload.email, tenantRole: payload.tenantRole };
  } catch {
    return null;
  }
}

function requireUser(req: Request): AuthenticatedUser {
  const user = authenticatedUser(req);
  if (!user) throw Object.assign(new Error('Token inválido ou expirado.'), { status: 401 });
  return user;
}

function positiveMoney(value: unknown, field = 'valor'): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw Object.assign(new Error(`${field} deve ser maior que zero.`), { status: 400 });
  }
  return Math.round(parsed * 100) / 100;
}

function nonNegativeMoney(value: unknown, field = 'valor'): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw Object.assign(new Error(`${field} não pode ser negativo.`), { status: 400 });
  }
  return Math.round(parsed * 100) / 100;
}

function requiredText(value: unknown, field: string): string {
  const text = String(value ?? '').trim();
  if (!text) throw Object.assign(new Error(`${field} é obrigatório.`), { status: 400 });
  return text;
}

function optionalText(value: unknown, maxLength = 255): string | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (text.length > maxLength) {
    throw Object.assign(new Error(`Texto excede o limite de ${maxLength} caracteres.`), { status: 400 });
  }
  return text;
}

async function categoryIdByName(
  client: import('pg').PoolClient,
  userId: string,
  categoryName: unknown,
): Promise<string | null> {
  const name = optionalText(categoryName, 80);
  if (!name) return null;
  const result = await client.query(
    'SELECT id FROM categories WHERE business_id = $1 AND lower(name) = lower($2)',
    [userId, name],
  );
  if (!result.rowCount) {
    throw Object.assign(new Error('A categoria selecionada não existe.'), { status: 400 });
  }
  return result.rows[0].id as string;
}

async function currentOpenSession(client: import('pg').PoolClient, userId: string) {
  const result = await client.query(
    `SELECT id FROM cash_sessions WHERE business_id = $1 AND status = 'open' FOR SHARE`,
    [userId],
  );
  if (!result.rowCount) {
    throw Object.assign(new Error('O caixa está fechado. Abra um novo caixa para registrar movimentações.'), {
      status: 409,
      code: 'CASH_CLOSED',
    });
  }
  return result.rows[0].id as string;
}

async function responseData(user: AuthenticatedUser) {
  return user.tenantRole === 'OPERATOR'
    ? loadOperatorData(user.id)
    : loadBootstrapData({ id: user.id, email: user.email, name: null });
}

async function refreshClosedCashSnapshot(
  client: import('pg').PoolClient,
  userId: string,
  cashSessionId: string | null,
) {
  if (!cashSessionId) return;
  await client.query(
    `UPDATE cash_sessions cs
     SET expected_balance = cs.opening_balance + COALESCE((
       SELECT SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE -t.amount END)
       FROM transactions t
       WHERE t.business_id = cs.business_id
         AND t.cash_session_id = cs.id
         AND t.payment_method = 'dinheiro'
     ), 0)
     WHERE cs.business_id = $1 AND cs.id = $2 AND cs.status = 'closed'`,
    [userId, cashSessionId],
  );
}

businessRouter.get('/data', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/reports/email', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const summary = await withTenantTransaction(user.id, async (client) => {
    const settingsResult = await client.query(
      `SELECT business_name, report_email FROM business_settings WHERE business_id = $1`,
      [user.id],
    );
    const settings = settingsResult.rows[0];
    const recipient = optionalText(settings?.report_email, 254);
    if (!recipient) throw Object.assign(new Error('Cadastre o e-mail dos relatórios nas configurações.'), { status: 400 });
    const totalsResult = await client.query(
      `SELECT
         COALESCE(SUM(amount) FILTER (WHERE type = 'entrada'), 0) AS income,
         COALESCE(SUM(amount) FILTER (WHERE type = 'saida'), 0) AS expenses,
         COUNT(*)::integer AS movements
       FROM transactions
       WHERE business_id = $1 AND occurred_at >= date_trunc('day', now())`,
      [user.id],
    );
    return { ...totalsResult.rows[0], recipient, businessName: settings.business_name };
  });
  const income = Number(summary.income);
  const expenses = Number(summary.expenses);
  const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  await sendEmail({
    to: summary.recipient,
    subject: `Resumo diário — ${summary.businessName}`,
    text: `Movimentações: ${summary.movements}\nEntradas: ${money(income)}\nSaídas: ${money(expenses)}\nSaldo: ${money(income - expenses)}`,
  });
  return res.json({ message: `Relatório enviado para ${summary.recipient}.` });
}));

businessRouter.put('/settings', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const name = requiredText(req.body?.nome, 'Nome do negócio');
  const category = requiredText(req.body?.categoria, 'Ramo de atuação');
  const offering = String(req.body?.oferta ?? '');
  const reportFrequency = String(req.body?.relatorio?.frequencia ?? 'nenhum');
  const viewPeriod = String(req.body?.viewPeriod ?? 'day');
  const dailyGoal = req.body?.metaDiariaVendas === undefined || req.body?.metaDiariaVendas === null
    ? null
    : nonNegativeMoney(req.body.metaDiariaVendas, 'Meta diária');
  const idleTimeout = Number(req.body?.idleTimeoutMinutes ?? 15);
  const receiptInput = req.body?.receiptSettings ?? {};
  const receiptSettings = {
    paperWidth: receiptInput.paperWidth === 58 ? 58 : 80,
    legalName: optionalText(receiptInput.legalName, 160),
    showOperator: receiptInput.showOperator !== false,
    showPaymentMethod: receiptInput.showPaymentMethod !== false,
  };
  if (!OFFERINGS.has(offering)) throw Object.assign(new Error('Oferta do negócio inválida.'), { status: 400 });
  if (!REPORT_FREQUENCIES.has(reportFrequency)) throw Object.assign(new Error('Frequência de relatório inválida.'), { status: 400 });
  if (!VIEW_PERIODS.has(viewPeriod)) throw Object.assign(new Error('Período do painel inválido.'), { status: 400 });
  if (!Number.isInteger(idleTimeout) || idleTimeout < 1 || idleTimeout > 120) throw Object.assign(new Error('Tempo de inatividade inválido.'), { status: 400 });

  await withTenantTransaction(user.id, async (client) => {
    await client.query(
      `INSERT INTO business_settings
        (business_id, business_name, business_category, offering, controls_stock,
         daily_sales_goal, report_frequency, report_by_email, report_email,
         view_period, onboarding_completed,idle_timeout_minutes,receipt_settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,$12,$13::jsonb)
       ON CONFLICT (business_id) DO UPDATE SET
         business_name = EXCLUDED.business_name,
         business_category = EXCLUDED.business_category,
         offering = EXCLUDED.offering,
         controls_stock = EXCLUDED.controls_stock,
         daily_sales_goal = EXCLUDED.daily_sales_goal,
         report_frequency = EXCLUDED.report_frequency,
         report_by_email = EXCLUDED.report_by_email,
         report_email = EXCLUDED.report_email,
         view_period = EXCLUDED.view_period,
         onboarding_completed = EXCLUDED.onboarding_completed,
         idle_timeout_minutes = EXCLUDED.idle_timeout_minutes,
         receipt_settings = EXCLUDED.receipt_settings`,
      [
        user.id,
        name,
        category,
        offering,
        req.body?.controlaEstoque === true,
        dailyGoal,
        reportFrequency,
        req.body?.relatorio?.porEmail === true,
        optionalText(req.body?.relatorio?.email, 254),
        viewPeriod,
        req.body?.onboardingConcluido === true,
        idleTimeout,
        JSON.stringify(receiptSettings),
      ],
    );
    await client.query('UPDATE businesses SET name=$2,category=$3,offering=$4,updated_at=now() WHERE id=$1',
      [user.id,name,category,offering]);
  });
  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/categories', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const name = requiredText(req.body?.name, 'Nome da categoria');
  try {
    await withTenantTransaction(user.id, async (client) => {
      await client.query('INSERT INTO categories (name) VALUES ($1)', [name]);
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw Object.assign(new Error('Já existe uma categoria com este nome.'), { status: 409 });
    }
    throw error;
  }
  return res.status(201).json({ data: await responseData(user) });
}));

businessRouter.patch('/categories/:id', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const name = requiredText(req.body?.name, 'Nome da categoria');
  try {
    await withTenantTransaction(user.id, async (client) => {
      const result = await client.query(
        'UPDATE categories SET name = $3 WHERE business_id = $1 AND id = $2',
        [user.id, req.params.id, name],
      );
      if (!result.rowCount) throw Object.assign(new Error('Categoria não encontrada.'), { status: 404 });
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw Object.assign(new Error('Já existe uma categoria com este nome.'), { status: 409 });
    }
    throw error;
  }
  return res.json({ data: await responseData(user) });
}));

businessRouter.delete('/categories/:id', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  await withTenantTransaction(user.id, async (client) => {
    await client.query('UPDATE products SET category_id = NULL WHERE business_id = $1 AND category_id = $2', [user.id, req.params.id]);
    const result = await client.query('DELETE FROM categories WHERE business_id = $1 AND id = $2', [user.id, req.params.id]);
    if (!result.rowCount) throw Object.assign(new Error('Categoria não encontrada.'), { status: 404 });
  });
  return res.json({ data: await responseData(user) });
}));

async function saveProduct(req: Request, user: AuthenticatedUser, productId?: string) {
  const kind = String(req.body?.type ?? '');
  const name = requiredText(req.body?.nome, 'Nome');
  if (!PRODUCT_KINDS.has(kind)) throw Object.assign(new Error('Tipo de item inválido.'), { status: 400 });
  const salePrice = positiveMoney(req.body?.precoVenda, 'Preço de venda');
  const cost = req.body?.custo === undefined || req.body?.custo === null ? 0 : nonNegativeMoney(req.body.custo, 'Custo');
  const stock = kind === 'product' ? nonNegativeMoney(req.body?.quantidade ?? 0, 'Quantidade') : null;
  const minimum = kind === 'product' ? nonNegativeMoney(req.body?.quantidadeMinima ?? 0, 'Estoque mínimo') : null;
  const duration = kind === 'service' ? requiredText(req.body?.duracao, 'Duração') : null;
  const barcode = optionalText(req.body?.codigoBarras, 64);

  try {
    await withTenantTransaction(user.id, async (client) => {
      const categoryId = await categoryIdByName(client, user.id, req.body?.categoria);
      if (productId) {
        const result = await client.query(
          `UPDATE products SET kind = $3, name = $4, barcode = $5, category_id = $6,
             sale_price = $7, cost_price = $8, stock_quantity = $9,
             minimum_quantity = $10, service_duration = $11::interval
           WHERE business_id = $1 AND id = $2 AND active`,
          [user.id, productId, kind, name, barcode, categoryId, salePrice, cost, stock, minimum, duration],
        );
        if (!result.rowCount) throw Object.assign(new Error('Item não encontrado.'), { status: 404 });
      } else {
        await client.query(
          `INSERT INTO products
            (kind, name, barcode, category_id, sale_price, cost_price,
             stock_quantity, minimum_quantity, service_duration)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::interval)`,
          [kind, name, barcode, categoryId, salePrice, cost, stock, minimum, duration],
        );
      }
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
      throw Object.assign(new Error('Este código de barras já está vinculado a outro item.'), { status: 409 });
    }
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '22007') {
      throw Object.assign(new Error('Informe uma duração válida, como “30 min” ou “1 hour”.'), { status: 400 });
    }
    throw error;
  }
}

businessRouter.post('/products', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  await saveProduct(req, user);
  return res.status(201).json({ data: await responseData(user) });
}));

businessRouter.patch('/products/:id', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  await saveProduct(req, user, req.params.id);
  return res.json({ data: await responseData(user) });
}));

businessRouter.delete('/products/:id', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  await withTenantTransaction(user.id, async (client) => {
    const result = await client.query(
      'UPDATE products SET active = false WHERE business_id = $1 AND id = $2 AND active',
      [user.id, req.params.id],
    );
    if (!result.rowCount) throw Object.assign(new Error('Item não encontrado.'), { status: 404 });
  });
  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/customers', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const name = requiredText(req.body?.name, 'Nome');
  const phone = String(req.body?.phone ?? '').trim() || null;

  const customer = await withTenantTransaction(user.id, async (client) => {
    const result = await client.query(
      `INSERT INTO customers (name, phone) VALUES ($1, $2) RETURNING id, name, phone`,
      [name, phone],
    );
    return result.rows[0];
  });

  return res.status(201).json({
    customer: { id: customer.id, nome: customer.name, telefone: customer.phone ?? undefined },
    data: await responseData(user),
  });
}));

businessRouter.post('/sales', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const paymentMethod = String(req.body?.paymentMethod ?? '');
  const customerId = req.body?.customerId ? String(req.body.customerId) : null;
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const clientSaleId = req.body?.clientSaleId ? String(req.body.clientSaleId) : null;
  const offline = req.body?.offline === true;
  const requestedSessionId = req.body?.cashSessionId ? String(req.body.cashSessionId) : null;
  const occurredAt = req.body?.occurredAt ? new Date(String(req.body.occurredAt)) : new Date();
  if (clientSaleId && !/^[0-9a-f-]{36}$/i.test(clientSaleId)) throw Object.assign(new Error('Identificador idempotente inválido.'), { status: 400 });
  if (!Number.isFinite(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 60_000 || occurredAt.getTime() < Date.now() - 7 * 86_400_000) {
    throw Object.assign(new Error('Data da venda offline fora da janela permitida.'), { status: 400 });
  }
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ paymentMethod, customerId, items, requestedSessionId, occurredAt: occurredAt.toISOString() })).digest('hex');
  if (offline && (req.body?.expectedTenantId !== user.id || req.body?.expectedActorId !== user.actorId)) {
    throw Object.assign(new Error('A fila offline pertence a outra sessão ou operador.'), { status: 409, code: 'OFFLINE_IDENTITY_CHANGED' });
  }

  if (!SALE_PAYMENT_METHODS.has(paymentMethod)) {
    throw Object.assign(new Error('Forma de pagamento inválida.'), { status: 400 });
  }
  if (paymentMethod === 'fiado' && !customerId) {
    throw Object.assign(new Error('Selecione um cliente para registrar uma venda fiado.'), { status: 400 });
  }
  if (paymentMethod !== 'fiado' && customerId) {
    throw Object.assign(new Error('Cliente de fiado só pode ser informado quando a forma for Fiado.'), { status: 400 });
  }
  if (items.length === 0) throw Object.assign(new Error('Adicione ao menos um item.'), { status: 400 });

  let createdSale: { id: string; soldAt: string; duplicate?: boolean } | undefined;
  await withTenantTransaction(user.id, async (client) => {
    if (clientSaleId) {
      const duplicate = await client.query('SELECT id,sold_at,request_hash FROM sales WHERE business_id=$1 AND client_sale_id=$2 FOR SHARE', [user.id, clientSaleId]);
      if (duplicate.rowCount) {
        if (duplicate.rows[0].request_hash !== requestHash) throw Object.assign(new Error('O identificador da venda já foi usado com outro conteúdo.'), { status: 409 });
        createdSale = { id: duplicate.rows[0].id, soldAt: new Date(duplicate.rows[0].sold_at).toISOString(), duplicate: true };
        return;
      }
    }
    const sessionId = await currentOpenSession(client, user.id);
    if (requestedSessionId && requestedSessionId !== sessionId) {
      throw Object.assign(new Error('O caixa da venda offline não está mais aberto.'), { status: 409, code: 'OFFLINE_CASH_CHANGED' });
    }
    const normalizedItems: Array<{
      productId: string | null;
      description: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
    }> = [];

    for (const rawItem of items) {
      const productId = rawItem?.productId ? String(rawItem.productId) : null;
      const quantity = positiveMoney(rawItem?.quantity, 'Quantidade');
      const unitPrice = positiveMoney(rawItem?.unitPrice, 'Valor unitário');
      let description = requiredText(rawItem?.description, 'Descrição');
      let unitCost = 0;

      if (productId) {
        const productResult = await client.query(
          `SELECT id, kind, name, cost_price, stock_quantity
             FROM products WHERE business_id = $1 AND id = $2 AND active FOR UPDATE`,
          [user.id, productId],
        );
        if (!productResult.rowCount) {
          throw Object.assign(new Error(`Produto ou serviço não encontrado: ${description}.`), { status: 404 });
        }
        const product = productResult.rows[0];
        description = product.name;
        unitCost = Number(product.cost_price);
        if (product.kind === 'product') {
          const update = await client.query(
            `UPDATE products SET stock_quantity = stock_quantity - $3
             WHERE business_id = $1 AND id = $2 AND stock_quantity >= $3`,
            [user.id, productId, quantity],
          );
          if (!update.rowCount) {
            throw Object.assign(new Error(`Estoque insuficiente para ${description}.`), { status: 409 });
          }
        }
      }

      normalizedItems.push({ productId, description, quantity, unitPrice, unitCost });
    }

    const total = normalizedItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const saleResult = await client.query(
      `INSERT INTO sales
        (cash_session_id, customer_id, description, payment_method, total_amount,actor_id,actor_name,client_sale_id,request_hash,sold_at)
       VALUES ($1, $2, $3, $4, $5,$6,$7,$8,$9,$10)
       RETURNING id, sold_at`,
      [sessionId, customerId, normalizedItems.map((item) => item.description).join(', '), paymentMethod, total,
        user.actorId, user.email, clientSaleId, clientSaleId ? requestHash : null, occurredAt],
    );
    const sale = saleResult.rows[0];
    createdSale = { id: sale.id, soldAt: new Date(sale.sold_at).toISOString() };

    for (const item of normalizedItems) {
      await client.query(
        `INSERT INTO sale_items
          (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [sale.id, item.productId, item.description, item.quantity, item.unitPrice, item.unitCost],
      );
    }

    if (paymentMethod === 'fiado') {
      await client.query(
        `INSERT INTO credit_sales (sale_id, customer_id, amount, due_date)
         VALUES ($1, $2, $3, CURRENT_DATE)`,
        [sale.id, customerId, total],
      );
    } else {
      await client.query(
        `INSERT INTO transactions
          (cash_session_id, sale_id, type, source, payment_method, amount, description, occurred_at)
         VALUES ($1, $2, 'entrada', 'venda', $3, $4, $5, $6)`,
        [sessionId, sale.id, paymentMethod, total, `Venda: ${normalizedItems.map((item) => item.description).join(', ')}`, sale.sold_at],
      );
    }
  });

  return res.status(createdSale?.duplicate ? 200 : 201).json({ data: await responseData(user), sale: createdSale });
}));

function cancellationReason(value: unknown): string {
  const reason = String(value ?? '').trim();
  if (reason.length < 3 || reason.length > 500) throw Object.assign(new Error('Informe o motivo do cancelamento ou devolução.'), { status: 400 });
  return reason;
}

businessRouter.post('/sales/:id/cancel', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const saleId = String(req.params.id);
  const reason = cancellationReason(req.body?.reason);
  if (req.body?.confirmationId !== saleId) throw Object.assign(new Error('Digite o número da venda para confirmar.'), { status: 400 });
  await withTenantTransaction(user.id, async client => {
    const result = await client.query('SELECT * FROM sales WHERE business_id=$1 AND id=$2 FOR UPDATE', [user.id, saleId]);
    const sale = result.rows[0];
    if (!sale) throw Object.assign(new Error('Venda não encontrada.'), { status: 404 });
    if (sale.status !== 'completed') throw Object.assign(new Error('A venda já foi cancelada.'), { status: 409 });
    if (sale.payment_method === 'fiado') {
      const credit = await client.query('SELECT id,paid_amount FROM credit_sales WHERE business_id=$1 AND sale_id=$2 FOR UPDATE', [user.id, saleId]);
      if (Number(credit.rows[0]?.paid_amount) > 0) throw Object.assign(new Error('Estorne os recebimentos do fiado antes de cancelar a venda.'), { status: 409 });
      await client.query('DELETE FROM credit_sales WHERE business_id=$1 AND sale_id=$2', [user.id, saleId]);
    } else {
      await client.query(`DELETE FROM transactions WHERE business_id=$1 AND sale_id=$2 AND source='venda'`, [user.id, saleId]);
    }
    await client.query(`UPDATE products p SET stock_quantity=p.stock_quantity+x.quantity FROM (
      SELECT product_id,SUM(quantity-returned_quantity) quantity FROM sale_items
      WHERE business_id=$1 AND sale_id=$2 AND product_id IS NOT NULL GROUP BY product_id) x
      WHERE p.business_id=$1 AND p.id=x.product_id AND p.stock_quantity IS NOT NULL`, [user.id, saleId]);
    await client.query('UPDATE sales SET status=\'cancelled\',cancelled_at=now(),returned_amount=total_amount WHERE business_id=$1 AND id=$2', [user.id, saleId]);
    await auditTenant(client, { tenantId: user.id, actorId: user.actorId, actorRole: user.tenantRole }, 'sale.cancelled', saleId, { reason });
  });
  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/sales/:id/returns', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const saleId = String(req.params.id);
  const itemId = String(req.body?.itemId ?? '');
  const quantity = positiveMoney(req.body?.quantity, 'Quantidade devolvida');
  const reason = cancellationReason(req.body?.reason);
  if (req.body?.confirmationId !== saleId) throw Object.assign(new Error('Digite o número da venda para confirmar.'), { status: 400 });
  await withTenantTransaction(user.id, async client => {
    const result = await client.query(`SELECT s.payment_method,s.cash_session_id,s.total_amount,s.returned_amount,
      si.product_id,si.product_name,si.quantity,si.returned_quantity,si.unit_price
      FROM sales s JOIN sale_items si ON si.business_id=s.business_id AND si.sale_id=s.id
      WHERE s.business_id=$1 AND s.id=$2 AND si.id=$3 AND s.status='completed' FOR UPDATE OF s,si`, [user.id, saleId, itemId]);
    const item = result.rows[0];
    if (!item) throw Object.assign(new Error('Venda ou item não encontrado.'), { status: 404 });
    if (quantity > Number(item.quantity) - Number(item.returned_quantity)) throw Object.assign(new Error('Quantidade devolvida excede o saldo do item.'), { status: 409 });
    const refund = Math.round(quantity * Number(item.unit_price) * 100) / 100;
    if (refund >= Number(item.total_amount) - Number(item.returned_amount)) throw Object.assign(new Error('Use o cancelamento total para devolver toda a venda.'), { status: 409 });
    await client.query('UPDATE sales SET returned_amount=returned_amount+$3 WHERE business_id=$1 AND id=$2', [user.id, saleId, refund]);
    if (item.payment_method === 'fiado') {
      const credit = await client.query('SELECT id,amount,paid_amount FROM credit_sales WHERE business_id=$1 AND sale_id=$2 FOR UPDATE', [user.id, saleId]);
      if (!credit.rowCount || Number(credit.rows[0].amount) - refund < Number(credit.rows[0].paid_amount)) {
        throw Object.assign(new Error('A devolução é menor que o valor já recebido do fiado.'), { status: 409 });
      }
      await client.query('UPDATE credit_sales SET amount=amount-$3,returned_amount=returned_amount+$3 WHERE business_id=$1 AND sale_id=$2', [user.id, saleId, refund]);
    } else {
      // O livro mantém uma única entrada líquida vinculada à venda. Isso evita
      // que um cancelamento posterior deixe uma saída de devolução órfã.
      const transaction = await client.query(
        `UPDATE transactions SET amount=amount-$3
         WHERE business_id=$1 AND sale_id=$2 AND source='venda' AND amount>$3 RETURNING id`,
        [user.id, saleId, refund],
      );
      if (!transaction.rowCount) throw Object.assign(new Error('Lançamento financeiro da venda não permite este estorno.'), { status: 409 });
    }
    await client.query('UPDATE sale_items SET returned_quantity=returned_quantity+$4 WHERE business_id=$1 AND sale_id=$2 AND id=$3', [user.id, saleId, itemId, quantity]);
    if (item.product_id) await client.query('UPDATE products SET stock_quantity=stock_quantity+$3 WHERE business_id=$1 AND id=$2 AND stock_quantity IS NOT NULL', [user.id, item.product_id, quantity]);
    await auditTenant(client, { tenantId: user.id, actorId: user.actorId, actorRole: user.tenantRole }, 'sale.item_returned', saleId, { itemId, quantity, amount: refund, reason });
  });
  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/transactions', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const type = String(req.body?.type ?? '');
  const description = requiredText(req.body?.description, 'Descrição');
  const amount = positiveMoney(req.body?.amount);
  const paymentMethod = String(req.body?.paymentMethod ?? 'dinheiro');
  const entryKind = req.body?.entryKind ? String(req.body.entryKind) : null;
  const expenseKind = req.body?.expenseKind ? String(req.body.expenseKind) : null;
  const requestedMovementKind = String(req.body?.movementKind ?? 'regular');

  if (!['entrada', 'saida'].includes(type)) throw Object.assign(new Error('Tipo de movimentação inválido.'), { status: 400 });
  if (!PAYMENT_METHODS.has(paymentMethod)) {
    throw Object.assign(new Error('Fiado não é uma forma válida para entrada manual.'), { status: 400 });
  }
  if (entryKind && !ENTRY_KINDS.has(entryKind)) throw Object.assign(new Error('Tipo de entrada inválido.'), { status: 400 });
  if (expenseKind && !EXPENSE_KINDS.has(expenseKind)) {
    throw Object.assign(new Error('Categoria de despesa inválida.'), { status: 400 });
  }
  if (type === 'entrada' && expenseKind) {
    throw Object.assign(new Error('Categoria de despesa não pode ser usada em uma entrada.'), { status: 400 });
  }
  if (type === 'saida' && entryKind) {
    throw Object.assign(new Error('Tipo de entrada não pode ser usado em uma despesa.'), { status: 400 });
  }
  if (requestedMovementKind === 'suprimento' && (type !== 'entrada' || paymentMethod !== 'dinheiro')) {
    throw Object.assign(new Error('Suprimento deve ser uma entrada em dinheiro.'), { status: 400 });
  }
  if (type === 'entrada' && requestedMovementKind !== 'suprimento' && !entryKind) {
    throw Object.assign(new Error('Selecione se a entrada é Produto, Serviço ou Gorjeta.'), { status: 400 });
  }
  const movementKind = paymentMethod === 'dinheiro' && type === 'saida'
    ? 'sangria'
    : paymentMethod === 'dinheiro' && requestedMovementKind === 'suprimento'
      ? 'suprimento'
      : 'regular';
  const pending =
    (type === 'entrada' && ['produto', 'servico'].includes(entryKind ?? '')) ||
    (type === 'saida' && !expenseKind);

  await withTenantTransaction(user.id, async (client) => {
    const sessionId = await currentOpenSession(client, user.id);
    await client.query(
      `INSERT INTO transactions
        (cash_session_id, type, source, payment_method, amount, description,
         movement_kind, entry_kind, expense_kind, identification_pending)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        sessionId,
        type,
        type === 'saida' ? 'despesa_avulsa' : 'ajuste',
        paymentMethod,
        amount,
        description,
        movementKind,
        type === 'entrada' ? entryKind : null,
        type === 'saida' ? expenseKind : null,
        pending,
      ],
    );
  });

  return res.status(201).json({ data: await responseData(user) });
}));

businessRouter.patch('/transactions/:id/identification', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const classification = String(req.body?.classification ?? '');
  const productId = req.body?.productId ? String(req.body.productId) : null;
  const requestedQuantity = req.body?.quantity === undefined ? 1 : Number(req.body.quantity);
  const correctedAmount = req.body?.correctedAmount === undefined
    ? null
    : positiveMoney(req.body.correctedAmount, 'Valor corrigido');

  await withTenantTransaction(user.id, async (client) => {
    const transactionResult = await client.query(
      `SELECT id, type, cash_session_id
       FROM transactions
       WHERE business_id = $1 AND id = $2
         AND source IN ('ajuste', 'despesa_avulsa')
         AND identification_pending
       FOR UPDATE`,
      [user.id, req.params.id],
    );
    if (!transactionResult.rowCount) {
      throw Object.assign(new Error('Pendência não encontrada ou já resolvida.'), { status: 404 });
    }

    const transaction = transactionResult.rows[0];
    if (transaction.type === 'entrada') {
      if (!ENTRY_KINDS.has(classification)) {
        throw Object.assign(new Error('Selecione Produto, Serviço ou Gorjeta.'), { status: 400 });
      }

      if (classification === 'gorjeta') {
        if (productId) {
          throw Object.assign(new Error('Gorjeta não pode ser vinculada a um produto ou serviço.'), { status: 400 });
        }
        await client.query(
          `UPDATE transactions
           SET entry_kind = 'gorjeta', amount = COALESCE($3, amount), identification_pending = false
           WHERE business_id = $1 AND id = $2`,
          [user.id, req.params.id, correctedAmount],
        );
        await refreshClosedCashSnapshot(client, user.id, transaction.cash_session_id);
        return;
      }

      if (!productId) {
        throw Object.assign(
          new Error(`Selecione qual ${classification === 'produto' ? 'produto' : 'serviço'} originou a entrada.`),
          { status: 400 },
        );
      }

      const productResult = await client.query(
        `SELECT id, kind, name, stock_quantity
         FROM products
         WHERE business_id = $1 AND id = $2 AND active
         FOR UPDATE`,
        [user.id, productId],
      );
      if (!productResult.rowCount) {
        throw Object.assign(new Error('Produto ou serviço não encontrado no catálogo.'), { status: 404 });
      }

      const product = productResult.rows[0];
      const expectedKind = classification === 'produto' ? 'product' : 'service';
      if (product.kind !== expectedKind) {
        throw Object.assign(
          new Error(
            classification === 'produto'
              ? 'O item selecionado não é um produto.'
              : 'O item selecionado não é um serviço.',
          ),
          { status: 400 },
        );
      }

      const quantity = classification === 'produto' ? requestedQuantity : 1;
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw Object.assign(new Error('A quantidade deve ser um número inteiro maior que zero.'), { status: 400 });
      }

      if (classification === 'produto') {
        const stockUpdate = await client.query(
          `UPDATE products
           SET stock_quantity = stock_quantity - $3
           WHERE business_id = $1 AND id = $2 AND stock_quantity >= $3`,
          [user.id, productId, quantity],
        );
        if (!stockUpdate.rowCount) {
          throw Object.assign(new Error(`Estoque insuficiente para ${product.name}.`), { status: 409 });
        }
      }

      await client.query(
        `UPDATE transactions
         SET entry_kind = $3, description = $4, amount = COALESCE($5, amount), identification_pending = false
         WHERE business_id = $1 AND id = $2`,
        [
          user.id,
          req.params.id,
          classification,
          classification === 'produto' && quantity > 1 ? `${product.name} (${quantity} un.)` : product.name,
          correctedAmount,
        ],
      );
      await refreshClosedCashSnapshot(client, user.id, transaction.cash_session_id);
      return;
    }

    if (productId) {
      throw Object.assign(new Error('Produto ou serviço só pode ser informado em uma entrada.'), { status: 400 });
    }

    if (!EXPENSE_KINDS.has(classification)) {
      throw Object.assign(new Error('Selecione uma categoria válida para a despesa.'), { status: 400 });
    }
    await client.query(
      `UPDATE transactions
       SET expense_kind = $3, amount = COALESCE($4, amount), identification_pending = false
       WHERE business_id = $1 AND id = $2`,
      [user.id, req.params.id, classification, correctedAmount],
    );
    await refreshClosedCashSnapshot(client, user.id, transaction.cash_session_id);
  });

  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/fixed-expenses', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const description = requiredText(req.body?.description, 'Descrição');
  const amount = positiveMoney(req.body?.amount);
  const recurrence = String(req.body?.recurrence ?? 'monthly');

  if (!FIXED_EXPENSE_RECURRENCES.has(recurrence)) {
    throw Object.assign(new Error('Recorrência inválida.'), { status: 400 });
  }

  await withTenantTransaction(user.id, async (client) => {
    await client.query(
      `INSERT INTO fixed_expenses (description, amount, recurrence, next_due_date)
       VALUES ($1, $2, $3, CURRENT_DATE)`,
      [description, amount, recurrence],
    );
  });

  return res.status(201).json({ data: await responseData(user) });
}));

businessRouter.delete('/fixed-expenses/:id', asyncRoute(async (req, res) => {
  const user = requireUser(req);

  await withTenantTransaction(user.id, async (client) => {
    const result = await client.query(
      `UPDATE fixed_expenses SET active = false
       WHERE business_id = $1 AND id = $2 AND active`,
      [user.id, req.params.id],
    );
    if (!result.rowCount) throw Object.assign(new Error('Conta fixa não encontrada.'), { status: 404 });
  });

  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/credits/:id/pay', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const paymentMethod = String(req.body?.paymentMethod ?? 'dinheiro');
  if (!PAYMENT_METHODS.has(paymentMethod)) throw Object.assign(new Error('Forma de pagamento inválida.'), { status: 400 });

  await withTenantTransaction(user.id, async (client) => {
    const sessionId = await currentOpenSession(client, user.id);
    const creditResult = await client.query(
      `SELECT cs.id, cs.amount - cs.paid_amount AS outstanding, c.name
       FROM credit_sales cs
       JOIN customers c ON c.business_id = cs.business_id AND c.id = cs.customer_id
       WHERE cs.business_id = $1 AND cs.id = $2 AND cs.status <> 'pago'
       FOR UPDATE OF cs`,
      [user.id, req.params.id],
    );
    if (!creditResult.rowCount) throw Object.assign(new Error('Fiado pendente não encontrado.'), { status: 404 });
    const credit = creditResult.rows[0];
    await client.query(
      `INSERT INTO transactions
        (cash_session_id, credit_sale_id, type, source, payment_method, amount, description)
       VALUES ($1, $2, 'entrada', 'pagamento_fiado', $3, $4, $5)`,
      [sessionId, credit.id, paymentMethod, credit.outstanding, `Pagamento de fiado — ${credit.name}`],
    );
  });

  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/fixed-expenses/:id/pay', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const paymentMethod = String(req.body?.paymentMethod ?? 'dinheiro');
  if (!PAYMENT_METHODS.has(paymentMethod)) throw Object.assign(new Error('Forma de pagamento inválida.'), { status: 400 });

  await withTenantTransaction(user.id, async (client) => {
    const expenseResult = await client.query(
      `SELECT id, description, amount, recurrence FROM fixed_expenses
       WHERE business_id = $1 AND id = $2 AND active FOR UPDATE`,
      [user.id, req.params.id],
    );
    if (!expenseResult.rowCount) throw Object.assign(new Error('Conta fixa não encontrada.'), { status: 404 });
    const expense = expenseResult.rows[0];
    const periodStart = expense.recurrence === 'weekly' ? 'week' : expense.recurrence === 'yearly' ? 'year' : 'month';
    const alreadyPaid = await client.query(
      `SELECT 1 FROM transactions
       WHERE business_id = $1 AND fixed_expense_id = $2 AND source = 'despesa_fixa'
         AND occurred_at >= date_trunc($3, now()) LIMIT 1`,
      [user.id, expense.id, periodStart],
    );
    if (alreadyPaid.rowCount) throw Object.assign(new Error('Esta conta fixa já foi paga no período atual.'), { status: 409 });

    const openSession = await client.query(
      `SELECT id FROM cash_sessions WHERE business_id = $1 AND status = 'open' FOR SHARE`,
      [user.id],
    );
    if (paymentMethod === 'dinheiro' && !openSession.rowCount) {
      throw Object.assign(new Error('Abra o caixa antes de pagar uma conta fixa em dinheiro.'), { status: 409 });
    }
    const movementKind = paymentMethod === 'dinheiro' ? 'sangria' : 'regular';
    await client.query(
      `INSERT INTO transactions
        (cash_session_id, fixed_expense_id, type, source, payment_method, amount, description, movement_kind)
       VALUES ($1, $2, 'saida', 'despesa_fixa', $3, $4, $5, $6)`,
      [openSession.rows[0]?.id ?? null, expense.id, paymentMethod, expense.amount, expense.description, movementKind],
    );
  });

  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/cash-sessions', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const openingBalance = nonNegativeMoney(req.body?.openingBalance ?? 0, 'Valor inicial');
  const responsible = String(req.body?.responsible ?? '').trim() || user.email.split('@')[0];

  await withTenantTransaction(user.id, async (client) => {
    const open = await client.query(`SELECT 1 FROM cash_sessions WHERE business_id = $1 AND status = 'open'`, [user.id]);
    if (open.rowCount) throw Object.assign(new Error('Já existe um caixa aberto.'), { status: 409 });
    await client.query(
      `INSERT INTO cash_sessions (responsible, opening_balance) VALUES ($1, $2)`,
      [responsible, openingBalance],
    );
  });

  return res.status(201).json({ data: await responseData(user) });
}));

businessRouter.post('/cash-sessions/:id/close', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  const countedCash = nonNegativeMoney(req.body?.countedCash, 'Dinheiro contado');
  const allowPending = req.body?.allowPending === true;

  await withTenantTransaction(user.id, async (client) => {
    const sessionResult = await client.query(
      `SELECT id FROM cash_sessions
       WHERE business_id = $1 AND id = $2 AND status = 'open'
       FOR UPDATE`,
      [user.id, req.params.id],
    );
    if (!sessionResult.rowCount) {
      throw Object.assign(new Error('Caixa aberto não encontrado.'), { status: 404 });
    }
    const pendingResult = await client.query(
      `SELECT COUNT(*)::integer AS count FROM transactions
       WHERE business_id = $1 AND cash_session_id = $2 AND identification_pending`,
      [user.id, req.params.id],
    );
    const pendingCount = Number(pendingResult.rows[0].count);
    if (pendingCount > 0 && !allowPending) {
      throw Object.assign(new Error(`Existem ${pendingCount} lançamentos pendentes de identificação.`), {
        status: 409,
        code: 'PENDING_IDENTIFICATION',
        pendingCount,
      });
    }
    await client.query(`SELECT close_cash_session($1, $2, now())`, [req.params.id, countedCash]);
  });

  return res.json({ data: await responseData(user) });
}));

businessRouter.post('/cash-sessions/:id/reopen', asyncRoute(async (req, res) => {
  const user = requireUser(req);
  if (req.body?.confirm !== true) {
    throw Object.assign(new Error('Confirme a reabertura do caixa para continuar.'), { status: 400 });
  }

  await withTenantTransaction(user.id, async (client) => {
    const latestResult = await client.query(
      `SELECT id, status
       FROM cash_sessions
       WHERE business_id = $1
       ORDER BY opened_at DESC, created_at DESC, id DESC
       LIMIT 1
       FOR UPDATE`,
      [user.id],
    );
    const latestSession = latestResult.rows[0] as { id: string; status: string } | undefined;

    if (!latestSession) {
      throw Object.assign(new Error('Nenhum fechamento foi encontrado.'), { status: 404 });
    }
    if (latestSession.status === 'open') {
      throw Object.assign(new Error('Já existe um caixa aberto. Finalize-o antes de corrigir outro fechamento.'), {
        status: 409,
        code: 'CASH_ALREADY_OPEN',
      });
    }
    if (latestSession.id !== req.params.id) {
      throw Object.assign(new Error('Somente o fechamento mais recente pode ser corrigido.'), {
        status: 409,
        code: 'NOT_LATEST_CASH_SESSION',
      });
    }

    await client.query(
      `UPDATE cash_sessions
       SET status = 'open',
           closed_at = NULL,
           closing_balance = NULL,
           expected_balance = NULL,
           notes = concat_ws(E'\\n', NULLIF(notes, ''), '[correção] Fechamento reaberto em ' || now()::text)
       WHERE business_id = $1 AND id = $2 AND status = 'closed'`,
      [user.id, req.params.id],
    );
  });

  return res.json({ data: await responseData(user) });
}));
