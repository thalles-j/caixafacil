import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import pg from 'pg';
import {
  ADMIN_PASSWORD, ADMIN_USERS, DEMO_BUSINESSES, DEMO_PASSWORD, DEMO_USERS, OPERATOR_PASSWORD,
} from './seedData.js';

dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)) });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL nao foi definida em backend/.env.');

const normalizedDatabaseUrl = new URL(databaseUrl);
if (['prefer', 'require', 'verify-ca'].includes(normalizedDatabaseUrl.searchParams.get('sslmode'))) {
  normalizedDatabaseUrl.searchParams.set('sslmode', 'verify-full');
}

const pool = new Pool({
  connectionString: normalizedDatabaseUrl.toString(),
  max: 1,
  connectionTimeoutMillis: 10_000,
  application_name: 'caixafacil-seed',
});

const RESET_DATABASE = process.argv.includes('--reset');
const REFRESH_DEMO = process.argv.includes('--refresh-demo');
let currentSeedActor = null;

const CATEGORY_DEFINITIONS = [
  ['bebidas', 'Bebidas'], ['alimentos', 'Alimentos'], ['doces', 'Doces'],
  ['conveniencia', 'Conveniência'], ['higiene', 'Higiene'], ['servicos', 'Serviços'],
];

const PRODUCT_DEFINITIONS = [
  ['cafe', 'bebidas', 'Café 500 ml', 8, 3.2, 80, 12],
  ['agua', 'bebidas', 'Água mineral', 4, 1.5, 120, 20],
  ['pao', 'alimentos', 'Pão de queijo', 6, 2.5, 90, 15],
  ['suco', 'bebidas', 'Suco de laranja', 9, 4, 35, 8],
  ['refrigerante', 'bebidas', 'Refrigerante lata', 7, 3.1, 60, 12],
  ['cha', 'bebidas', 'Chá gelado', 7.5, 3, 28, 7],
  ['leite', 'bebidas', 'Leite integral', 6.5, 4.2, 22, 6],
  ['achocolatado', 'bebidas', 'Achocolatado', 5.5, 2.4, 18, 5],
  ['energetico', 'bebidas', 'Energético', 12, 6.8, 2, 8],
  ['agua_gas', 'bebidas', 'Água com gás', 5, 2, 24, 6],
  ['croissant', 'alimentos', 'Croissant', 10, 4.5, 20, 5],
  ['bolo', 'doces', 'Bolo de chocolate — fatia', 11, 4.8, 16, 4],
  ['sanduiche', 'alimentos', 'Sanduíche natural', 14, 6.2, 18, 5],
  ['coxinha', 'alimentos', 'Coxinha', 8, 3.4, 40, 10],
  ['empada', 'alimentos', 'Empada de frango', 9, 3.8, 30, 8],
  ['cookie', 'doces', 'Cookie artesanal', 7, 2.7, 26, 6],
  ['brigadeiro', 'doces', 'Brigadeiro gourmet', 4.5, 1.6, 45, 10],
  ['barra', 'conveniencia', 'Barrinha de cereal', 5, 2.2, 32, 8],
  ['guardanapo', 'conveniencia', 'Guardanapo — pacote', 6, 3, 14, 4],
  ['copo', 'conveniencia', 'Copo descartável — pacote', 9, 4.5, 12, 4],
  ['sacola', 'conveniencia', 'Sacola de papel', 2, 0.7, 100, 25],
  ['detergente', 'higiene', 'Detergente', 4.5, 2.1, 10, 3],
  ['alcool', 'higiene', 'Álcool 70%', 9.5, 5.2, 0, 4],
  ['papel_toalha', 'higiene', 'Papel toalha', 8.5, 4.1, 2, 6],
];

const SERVICE_DEFINITIONS = [
  ['entrega', 'Entrega local', 12, 0, '30 minutes'],
  ['atendimento', 'Atendimento personalizado', 75, 0, '1 hour'],
  ['encomenda', 'Encomenda expressa', 25, 2, '45 minutes'],
  ['cesta', 'Montagem de cesta', 35, 5, '40 minutes'],
  ['personalizacao', 'Personalização de pedido', 18, 1, '20 minutes'],
  ['consultoria', 'Consultoria de compras', 90, 0, '1 hour 30 minutes'],
];

const FIXED_EXPENSE_DEFINITIONS = [
  ['Aluguel', 1200, 'monthly', 10], ['Energia elétrica', 280, 'monthly', 8],
  ['Água', 95, 'monthly', 12], ['Internet', 120, 'monthly', 15],
  ['Contabilidade', 350, 'monthly', 5], ['Sistema de gestão', 89, 'monthly', 20],
  ['Seguro', 160, 'monthly', 25], ['Telefone', 75, 'monthly', 18],
  ['Marketing', 240, 'monthly', 14], ['Segurança', 130, 'monthly', 6],
  ['Taxas bancárias', 45, 'monthly', 3], ['Manutenção de equipamentos', 110, 'monthly', 22],
  ['Coleta de resíduos', 60, 'monthly', 9], ['Limpeza', 35, 'weekly', 1],
  ['Combustível', 80, 'weekly', 5], ['Pequenos reparos', 50, 'weekly', 3],
  ['Material de escritório', 40, 'weekly', 4], ['Reposição de embalagens', 65, 'weekly', 2],
];

const now = new Date();
const REPORT_YEAR = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

const money = (value, factor = 1) => Number((value * factor).toFixed(2));
const dateAt = (year, month, day, hour, minute = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0)).toISOString();
const dateOnlyAt = (year, month, day) => dateAt(year, month, day, 12).slice(0, 10);
const dateOnlyDaysFromNow = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
const dateOnlyDaysAgo = (days) => dateOnlyDaysFromNow(-days);
const timeOnDate = (date, hour, minute = 0) =>
  `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

async function applySchema() {
  const migrationPaths = [
    './migrations/0001_init/migration.sql',
    './migrations/0002_admin_panel/migration.sql',
    './migrations/0003_admin_account_management/migration.sql',
    './migrations/0004_tenant_operations/migration.sql',
    './migrations/0005_privacy/migration.sql',
    './migrations/0006_multi_business/migration.sql',
    './migrations/0007_admin_platform/migration.sql',
  ];
  for (const migrationPath of migrationPaths) {
    const schema = await readFile(new URL(migrationPath, import.meta.url), 'utf8');
    await pool.query(schema);
  }
}

async function resetDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`TRUNCATE TABLE
      auth_sessions, privacy_erasure_tombstones, admin_audit_logs, transactions,
      credit_sales, sale_items, sales, cash_sessions, fixed_expenses, products,
      categories, customers, business_settings, business_memberships,
      tenant_memberships, businesses, password_reset_tokens, users CASCADE`);
    await client.query('COMMIT');
    console.log(`Banco reiniciado para receber a demonstração rica (${result.command}).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function refreshDemoAccounts() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const owners = await client.query('SELECT id FROM users WHERE email=ANY($1::citext[])', [DEMO_USERS.map(user => user.email)]);
    const ownerIds = owners.rows.map(row => row.id);
    if (ownerIds.length) {
      const businesses = await client.query('SELECT id FROM businesses WHERE owner_user_id=ANY($1::uuid[])', [ownerIds]);
      const businessIds = businesses.rows.map(row => row.id);
      const operators = businessIds.length
        ? await client.query(`SELECT user_id AS id FROM business_memberships
            WHERE business_id=ANY($1::uuid[]) AND role='OPERATOR'`, [businessIds])
        : { rows: [] };
      const accountIds = [...new Set([...ownerIds, ...operators.rows.map(row => row.id)])];
      await client.query('ALTER TABLE admin_audit_logs DISABLE TRIGGER audit_immutable');
      await client.query(`DELETE FROM admin_audit_logs WHERE
        business_id=ANY($1::uuid[]) OR actor_id=ANY($2::uuid[]) OR target_user_id=ANY($2::uuid[])`,
      [businessIds, accountIds]);
      await client.query('ALTER TABLE admin_audit_logs ENABLE TRIGGER audit_immutable');
      await client.query(`DELETE FROM auth_sessions WHERE business_id=ANY($1::uuid[])
        OR user_id=ANY($2::uuid[]) OR actor_id=ANY($2::uuid[])`, [businessIds, accountIds]);
      await client.query('DELETE FROM privacy_erasure_tombstones WHERE business_id=ANY($1::uuid[])', [businessIds]);
      for (const table of [
        'transactions', 'credit_sales', 'sale_items', 'sales', 'cash_sessions',
        'fixed_expenses', 'products', 'categories', 'customers', 'business_settings',
      ]) await client.query(`DELETE FROM ${table} WHERE business_id=ANY($1::uuid[])`, [businessIds]);
      await client.query('DELETE FROM businesses WHERE id=ANY($1::uuid[])', [businessIds]);
      await client.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [accountIds]);
    }
    await client.query('COMMIT');
    console.log(`Contas de demonstração atualizadas: ${ownerIds.length} proprietário(s) anterior(es) removido(s).`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertReturningId(client, sql, values) {
  const result = await client.query(sql, values);
  return result.rows[0].id;
}

async function userExists(client, email) {
  const result = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
  return Boolean(result.rowCount);
}

async function seedCatalog(client, factor) {
  const categories = new Map();
  for (const [key, name] of CATEGORY_DEFINITIONS) {
    categories.set(key, await insertReturningId(client, 'INSERT INTO categories (name) VALUES ($1) RETURNING id', [name]));
  }

  const catalog = new Map();
  const totalItems = PRODUCT_DEFINITIONS.length + SERVICE_DEFINITIONS.length;
  for (const [index, definition] of PRODUCT_DEFINITIONS.entries()) {
    const [key, category, name, rawPrice, rawCost, stock, minimum] = definition;
    const price = money(rawPrice, factor);
    const cost = money(rawCost, factor);
    const id = await insertReturningId(
      client,
      `INSERT INTO products
         (category_id, kind, name, barcode, sale_price, cost_price, stock_quantity, minimum_quantity, created_at)
       VALUES ($1, 'product', $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [categories.get(category), name, String(7891000000000 + index), price, cost, stock, minimum, minutesAgo((totalItems - index) * 1440)],
    );
    catalog.set(key, { id, key, kind: 'product', name, price, cost });
  }
  for (const [index, definition] of SERVICE_DEFINITIONS.entries()) {
    const [key, name, rawPrice, rawCost, duration] = definition;
    const price = money(rawPrice, factor);
    const cost = money(rawCost, factor);
    const id = await insertReturningId(
      client,
      `INSERT INTO products
         (category_id, kind, name, sale_price, cost_price, service_duration, created_at)
       VALUES ($1, 'service', $2, $3, $4, $5::interval, $6)
       RETURNING id`,
      [categories.get('servicos'), name, price, cost, duration, minutesAgo((SERVICE_DEFINITIONS.length - index) * 1440)],
    );
    catalog.set(key, { id, key, kind: 'service', name, price, cost });
  }
  return catalog;
}

async function seedCustomers(client, user) {
  const names = [
    'Maria Silva', 'João Santos', 'Ana Souza', 'Carlos Oliveira', 'Beatriz Lima', 'Rafael Costa',
    'Juliana Rocha', 'Fernando Alves', 'Camila Martins', 'Lucas Ribeiro', 'Patrícia Gomes', 'Diego Ferreira',
    'Renata Carvalho', 'Bruno Barbosa', 'Larissa Mendes', 'Eduardo Nunes', 'Aline Cardoso', 'Gustavo Freitas',
    'Mariana Moreira', 'Felipe Araújo', 'Sofia Teixeira', 'André Vieira',
  ];
  const customers = [];
  for (const [index, name] of names.entries()) {
    const id = await insertReturningId(
      client,
      `INSERT INTO customers
        (name, phone, email, notes, whatsapp_consent_at, whatsapp_consent_version, whatsapp_consent_recorded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [
        name,
        `(11) 9${String(1000 + index).padStart(4, '0')}-${String(2000 + index).padStart(4, '0')}`,
        `cliente${index + 1}.${user.name.toLowerCase()}@example.com`,
        index % 5 === 0 ? 'Prefere contato no período da tarde.' : null,
        index % 3 === 0 ? minutesAgo(4_000 - index * 20) : null,
        index % 3 === 0 ? '2026-09-01' : null,
        index % 3 === 0 ? currentSeedActor.id : null,
      ],
    );
    customers.push({ id, name });
  }
  return customers;
}

async function seedFixedExpenses(client, factor) {
  const expenses = new Map();
  for (const [index, [description, amount, recurrence, dueDay]] of FIXED_EXPENSE_DEFINITIONS.entries()) {
    const scaledAmount = money(amount, factor);
    const id = await insertReturningId(
      client,
      `INSERT INTO fixed_expenses
         (description, amount, recurrence, due_day, next_due_date, created_at)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [description, scaledAmount, recurrence, dueDay, dateOnlyDaysFromNow(index + 1), minutesAgo(2_000 + index)],
    );
    expenses.set(description, { id, amount: scaledAmount });
  }
  return expenses;
}

async function seedImmediateSale(client, { sessionId, item, quantity, paymentMethod, occurredAt, description }) {
  const total = money(item.price * quantity);
  const saleId = await insertReturningId(
    client,
    `INSERT INTO sales
       (cash_session_id, description, payment_method, total_amount, sold_at, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [sessionId, description ?? `Venda de ${item.name}`, paymentMethod, total, occurredAt,
      currentSeedActor.id, currentSeedActor.name],
  );
  await client.query(
    `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [saleId, item.id, item.name, quantity, item.price, item.cost],
  );
  await client.query(
    `INSERT INTO transactions
       (cash_session_id, sale_id, type, source, payment_method, amount, description, occurred_at)
     VALUES ($1, $2, 'entrada', 'venda', $3, $4, $5, $6)`,
    [sessionId, saleId, paymentMethod, total, `Recebimento de ${item.name}`, occurredAt],
  );
}

async function seedClosedSession(client, { responsible, date, openingBalance, sales, expenses, difference = 0 }) {
  const sessionId = await insertReturningId(
    client,
    `INSERT INTO cash_sessions (responsible, opened_at, opening_balance, notes)
     VALUES ($1, $2, $3, 'Fechamento histórico criado pela seed ampliada') RETURNING id`,
    [responsible, timeOnDate(date, 8), openingBalance],
  );
  for (const [index, sale] of sales.entries()) {
    await seedImmediateSale(client, { sessionId, ...sale, occurredAt: timeOnDate(date, 9 + index, index * 7) });
  }
  for (const [index, expense] of expenses.entries()) {
    await client.query(
      `INSERT INTO transactions
         (cash_session_id, type, source, payment_method, amount, description,
          movement_kind, expense_kind, occurred_at)
       VALUES ($1, 'saida', 'despesa_avulsa', $2, $3, $4, $5, $6, $7)`,
      [sessionId, expense.paymentMethod, expense.amount, expense.description,
        expense.paymentMethod === 'dinheiro' ? 'sangria' : 'regular', expense.kind, timeOnDate(date, 16, index * 10)],
    );
  }
  const expectedResult = await client.query(
    `SELECT cs.opening_balance
       + COALESCE(SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE -t.amount END)
           FILTER (WHERE t.payment_method = 'dinheiro'), 0) AS expected
     FROM cash_sessions cs
     LEFT JOIN transactions t ON t.user_id = cs.user_id AND t.cash_session_id = cs.id
     WHERE cs.id = $1 GROUP BY cs.id`,
    [sessionId],
  );
  const counted = money(Number(expectedResult.rows[0].expected) + difference);
  await client.query('SELECT close_cash_session($1, $2, $3)', [sessionId, counted, timeOnDate(date, 19)]);
  return { id: sessionId, date };
}

async function seedHistoricalSessions(client, user, factor, catalog) {
  const sessions = [];
  const rotatingProducts = PRODUCT_DEFINITIONS.slice(1).map(([key]) => catalog.get(key));
  const services = SERVICE_DEFINITIONS.map(([key]) => catalog.get(key));
  const cafe = catalog.get('cafe');
  const paymentMethods = ['pix', 'cartao_credito', 'cartao_debito'];
  let cursor = 0;
  for (const month of [1, 2, 3, 4]) {
    for (const day of [5, 12, 19, 26]) {
      const date = dateOnlyAt(REPORT_YEAR, month, day);
      sessions.push(await seedClosedSession(client, {
        responsible: user.name,
        date,
        openingBalance: money(80 + month * 10, factor),
        sales: [
          { item: cafe, quantity: 3 + (cursor % 5), paymentMethod: 'dinheiro' },
          { item: rotatingProducts[cursor % rotatingProducts.length], quantity: 1 + (cursor % 3), paymentMethod: paymentMethods[cursor % 3] },
          { item: services[cursor % services.length], quantity: 1, paymentMethod: cursor % 2 ? 'pix' : 'cartao_credito' },
        ],
        expenses: [{
          amount: money(8 + (cursor % 4) * 3, factor),
          description: ['Embalagens', 'Transporte', 'Material de limpeza', 'Pequeno reparo'][cursor % 4],
          paymentMethod: cursor % 3 === 0 ? 'pix' : 'dinheiro',
          kind: ['mercadoria', 'combustivel', 'outros', 'fornecedor'][cursor % 4],
        }],
        difference: money([-1.5, 0, 0.5, 2][cursor % 4], factor),
      }));
      cursor += 1;
    }
  }
  for (const [index, daysAgo] of [10, 7, 4, 2].entries()) {
    sessions.push(await seedClosedSession(client, {
      responsible: user.name,
      date: dateOnlyDaysAgo(daysAgo),
      openingBalance: money(100, factor),
      sales: [
        { item: cafe, quantity: 5 + index, paymentMethod: 'dinheiro' },
        { item: rotatingProducts[(cursor + index) % rotatingProducts.length], quantity: 2, paymentMethod: 'pix' },
        { item: services[(cursor + index) % services.length], quantity: 1, paymentMethod: 'cartao_credito' },
      ],
      expenses: [{ amount: money(12 + index * 2, factor), description: 'Despesa operacional recente', paymentMethod: index % 2 ? 'pix' : 'dinheiro', kind: 'outros' }],
      difference: money(index === 1 ? -0.5 : index === 3 ? 1 : 0, factor),
    }));
  }
  return sessions;
}

async function seedCreditSales(client, { customers, sessions, catalog }) {
  const credits = [];
  const creditItems = ['pao', 'bolo', 'sanduiche', 'cesta', 'atendimento'];
  for (let index = 0; index < 20; index += 1) {
    const customer = customers[index];
    const session = sessions[index % sessions.length];
    const item = catalog.get(creditItems[index % creditItems.length]);
    const quantity = item.kind === 'service' ? 1 : 1 + (index % 3);
    const total = money(item.price * quantity);
    const soldAt = timeOnDate(session.date, 14, index % 50);
    const saleId = await insertReturningId(
      client,
      `INSERT INTO sales
        (cash_session_id, customer_id, description, payment_method, total_amount, sold_at, actor_id, actor_name)
       VALUES ($1, $2, $3, 'fiado', $4, $5, $6, $7) RETURNING id`,
      [session.id, customer.id, `Fiado — ${item.name}`, total, soldAt,
        currentSeedActor.id, currentSeedActor.name],
    );
    await client.query(
      `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, unit_cost)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [saleId, item.id, item.name, quantity, item.price, item.cost],
    );
    const creditId = await insertReturningId(
      client,
      `INSERT INTO credit_sales (sale_id, customer_id, amount, due_date, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [saleId, customer.id, total, dateOnlyDaysFromNow((index % 8) * 4 - 12), soldAt],
    );
    credits.push({ id: creditId, customer, amount: total, index });
  }
  return credits;
}

async function seedOpenSession(client, { user, factor, catalog, fixedExpenses, credits }) {
  const sessionId = await insertReturningId(
    client,
    `INSERT INTO cash_sessions (responsible, opened_at, opening_balance, notes)
     VALUES ($1, $2, $3, 'Caixa atual completo para testes de paginação') RETURNING id`,
    [user.name, minutesAgo(360), money(150, factor)],
  );
  const currentItems = ['cafe', 'agua', 'pao', 'suco', 'entrega'];
  for (const [index, key] of currentItems.entries()) {
    await seedImmediateSale(client, {
      sessionId,
      item: catalog.get(key),
      quantity: index + 1,
      paymentMethod: ['dinheiro', 'pix', 'cartao_credito', 'dinheiro', 'pix'][index],
      occurredAt: minutesAgo(330 - index * 15),
      description: `Venda atual ${index + 1}`,
    });
  }

  const manualEntries = [
    ['entrada', 'dinheiro', 6, 'Gorjeta do turno da manhã', 'regular', 'gorjeta', null, false],
    ['entrada', 'pix', 18, 'Venda rápida identificada', 'regular', 'produto', null, false],
    ['entrada', 'dinheiro', 22, 'Serviço rápido identificado', 'regular', 'servico', null, false],
    ['entrada', 'dinheiro', 15, 'Venda pendente de produto', 'regular', 'produto', null, true],
    ['entrada', 'pix', 30, 'Serviço pendente', 'regular', 'servico', null, true],
    ['saida', 'dinheiro', 12, 'Compra emergencial', 'sangria', null, 'mercadoria', false],
    ['saida', 'pix', 35, 'Pagamento de fornecedor', 'regular', null, 'fornecedor', false],
    ['saida', 'dinheiro', 20, 'Combustível de entrega', 'sangria', null, 'combustivel', false],
    ['saida', 'pix', 8, 'Material de escritório', 'regular', null, 'outros', false],
    ['saida', 'dinheiro', 10, 'Retirada para cofre', 'sangria', null, 'outros', false],
    ['entrada', 'pix', 5, 'Gorjeta via Pix', 'regular', 'gorjeta', null, false],
    ['saida', 'dinheiro', 7, 'Reposição de sacolas', 'sangria', null, 'mercadoria', false],
  ];
  for (const [index, entry] of manualEntries.entries()) {
    const [type, paymentMethod, amount, description, movementKind, entryKind, expenseKind, pending] = entry;
    await client.query(
      `INSERT INTO transactions
         (cash_session_id, type, source, payment_method, amount, description,
          movement_kind, entry_kind, expense_kind, identification_pending, occurred_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [sessionId, type, type === 'entrada' ? 'ajuste' : 'despesa_avulsa', paymentMethod,
        money(amount, factor), description, movementKind, entryKind, expenseKind, pending, minutesAgo(240 - index * 8)],
    );
  }

  for (const [index, description] of ['Limpeza', 'Internet', 'Energia elétrica'].entries()) {
    const expense = fixedExpenses.get(description);
    await client.query(
      `INSERT INTO transactions
         (cash_session_id, fixed_expense_id, type, source, payment_method, amount,
          description, movement_kind, occurred_at)
       VALUES ($1, $2, 'saida', 'despesa_fixa', $3, $4, $5, $6, $7)`,
      [sessionId, expense.id, index === 1 ? 'pix' : 'dinheiro', expense.amount,
        `Pagamento de ${description}`, index === 1 ? 'regular' : 'sangria', minutesAgo(120 - index * 10)],
    );
  }

  for (const credit of credits.filter((item) => item.index % 4 === 0 || item.index % 5 === 0)) {
    const fullPayment = credit.index % 4 === 0;
    const amount = fullPayment ? credit.amount : money(credit.amount / 2);
    await client.query(
      `INSERT INTO transactions
         (cash_session_id, credit_sale_id, type, source, payment_method, amount, description, occurred_at)
       VALUES ($1, $2, 'entrada', 'pagamento_fiado', $3, $4, $5, $6)`,
      [sessionId, credit.id, credit.index % 2 ? 'pix' : 'dinheiro', amount,
        `${fullPayment ? 'Quitação' : 'Pagamento parcial'} de ${credit.customer.name}`, minutesAgo(80 - credit.index)],
    );
  }
}

async function seedOperator(client, owner, business, profile, passwordHash) {
  const email = `operador.${profile.key}.${owner.email}`;
  const name = `${profile.key === 'studio' ? 'Camila' : profile.key === 'mercado' ? 'Rafael' : 'Marina'} — ${profile.name}`;
  const actorId = await insertReturningId(client,
    `INSERT INTO users (email,password_hash,name,role,account_kind,status)
     VALUES($1,$2,$3,'client','operator','active') RETURNING id`,
    [email, passwordHash, name]);
  await client.query(`INSERT INTO business_memberships(user_id,business_id,role)
    VALUES($1,$2,'OPERATOR')`, [actorId, business.id]);
  await client.query(`INSERT INTO tenant_memberships(actor_id,user_id,role)
    VALUES($1,$2,'OPERATOR') ON CONFLICT(actor_id) DO NOTHING`, [actorId, owner.id]);
  return { id: actorId, name, email };
}

async function seedAuditTrail(client, { owner, business, operator, customers }) {
  const events = [
    [owner.id, 'OWNER', operator.id, 'operator.created', { operatorName: operator.name }],
    [owner.id, 'OWNER', business.id, 'business.settings_updated', { fields: ['receiptSettings', 'idleTimeoutMinutes'] }],
    [operator.id, 'OPERATOR', operator.id, 'business.post', { path: '/api/business/sales' }],
    [operator.id, 'OPERATOR', customers[0].id, 'customer.whatsapp_consent_granted', { version: '2026-09-01' }],
    [operator.id, 'OPERATOR', customers[0].id, 'customer.whatsapp_charge_prepared', { consentVersion: '2026-09-01' }],
    [operator.id, 'OPERATOR', customers[1].id, 'customer.whatsapp_consent_revoked', { version: null }],
    [operator.id, 'OPERATOR', business.id, 'cash.closing_corrected', { reason: 'Conferência do fundo de troco' }],
    [operator.id, 'OPERATOR', business.id, 'sale.item_returned', { quantity: 1, amount: 8, reason: 'Produto devolvido sem uso' }],
    [owner.id, 'OWNER', business.id, 'privacy.export_requested', { scope: 'active-business' }],
  ];
  for (const [index, [actorId, actorRole, targetId, action, details]] of events.entries()) {
    await client.query(
      `INSERT INTO admin_audit_logs
        (user_id,business_id,actor_id,actor_role,target_user_id,action,details,created_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
      [owner.id, business.id, actorId, actorRole, targetId, action, JSON.stringify(details),
        minutesAgo(500 - index * 25)],
    );
  }
}

async function seedTenant(client, user, passwordHash, operatorPasswordHash) {
  await client.query('BEGIN');
  try {
    const ownerId = await insertReturningId(
      client,
      "INSERT INTO users (email, password_hash, name, account_kind) VALUES ($1, $2, $3, 'owner') RETURNING id",
      [user.email, passwordHash, user.name],
    );
    await client.query(`INSERT INTO tenant_memberships(actor_id,user_id,role)
      VALUES($1,$1,'OWNER')`, [ownerId]);
    const owner = { ...user, id: ownerId };
    const totals = { businesses: 0, operators: 0, products: 0, customers: 0, closedSessions: 0, creditSales: 0, auditEvents: 0 };
    for (const [index, profile] of DEMO_BUSINESSES.entries()) {
      const businessId = await insertReturningId(client,
        `INSERT INTO businesses(owner_user_id,name,category,offering)
         VALUES($1,$2,$3,$4) RETURNING id`,
        [ownerId, `${profile.name} — ${user.name}`, profile.category, profile.offering]);
      const business = { id: businessId, ...profile };
      await client.query(`INSERT INTO business_memberships(user_id,business_id,role)
        VALUES($1,$2,'OWNER')`, [ownerId, businessId]);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [ownerId]);
      await client.query("SELECT set_config('app.current_business_id', $1, true)", [businessId]);
      await client.query(
        `INSERT INTO business_settings
          (user_id,business_id,business_name,business_category,offering,controls_stock,
           daily_sales_goal,report_frequency,report_by_email,report_email,view_period,
           onboarding_completed,idle_timeout_minutes,receipt_settings)
         VALUES($1,$2,$3,$4,$5,true,$6,'ambos',true,$7,$8,true,$9,$10)`,
        [ownerId, businessId, `${profile.name} — ${user.name}`, profile.category, profile.offering,
          money(650 + index * 225, user.factor * profile.factor), user.email,
          index % 2 ? 'week' : 'day', 10 + index * 5,
          JSON.stringify({ paperWidth: index % 2 ? 58 : 80, showOperator: true, showPaymentMethod: true })],
      );
      const operator = await seedOperator(client, owner, business, profile, operatorPasswordHash);
      currentSeedActor = operator;
      const factor = user.factor * profile.factor;
      const catalog = await seedCatalog(client, factor);
      const customers = await seedCustomers(client, { ...user, name: `${user.name}.${profile.key}` });
      const fixedExpenses = await seedFixedExpenses(client, factor);
      const sessions = await seedHistoricalSessions(client, { ...user, name: operator.name }, factor, catalog);
      const credits = await seedCreditSales(client, { customers, sessions, catalog });
      await seedOpenSession(client, { user: { ...user, name: operator.name }, factor, catalog, fixedExpenses, credits });
      await seedAuditTrail(client, { owner, business, operator, customers });
      totals.businesses += 1;
      totals.operators += 1;
      totals.products += PRODUCT_DEFINITIONS.length + SERVICE_DEFINITIONS.length;
      totals.customers += customers.length;
      totals.closedSessions += sessions.length;
      totals.creditSales += credits.length;
      totals.auditEvents += 9;
    }
    await client.query('COMMIT');
    return totals;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function seedAdmin(client, admin, passwordHash, adminLevel) {
  await client.query('BEGIN');
  try {
    await client.query(
      `INSERT INTO users (email, password_hash, name, role, status, admin_level)
       VALUES ($1, $2, $3, 'admin', 'active', $4)
       ON CONFLICT (email) DO UPDATE SET
         password_hash = EXCLUDED.password_hash,
         name = EXCLUDED.name,
          role = 'admin',
          status = 'active',
          admin_level = EXCLUDED.admin_level,
         token_version = users.token_version + 1,
         updated_at = now()
       RETURNING id`,
      [admin.email, passwordHash, admin.name, adminLevel],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function main() {
  console.log('Aplicando schema...');
  await applySchema();
  if (RESET_DATABASE) await resetDatabase();
  else if (REFRESH_DEMO) await refreshDemoAccounts();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const adminPasswordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const operatorPasswordHash = await bcrypt.hash(OPERATOR_PASSWORD, 10);
  const client = await pool.connect();
  try {
    for (const user of DEMO_USERS) {
      if (await userExists(client, user.email)) {
        await client.query(
          `UPDATE users SET password_hash = $1, role = 'client', account_kind='owner', status = 'active',
             token_version = token_version + 1, updated_at = now() WHERE email = $2 RETURNING id`,
          [passwordHash, user.email],
        );
        await client.query(`INSERT INTO tenant_memberships(actor_id,user_id,role)
          SELECT id,id,'OWNER' FROM users WHERE email=$1
          ON CONFLICT(actor_id) DO UPDATE SET user_id=excluded.user_id,role='OWNER',active=true`, [user.email]);
        console.log(`Conta ${user.email} ja existe; senha de demonstracao atualizada e dados preservados. Use --reset para recriar os dados.`);
        continue;
      }
      const summary = await seedTenant(client, user, passwordHash, operatorPasswordHash);
      console.log(
        `Seed de ${user.email}: ${summary.businesses} negócios, ${summary.operators} operadores, ` +
        `${summary.products} itens, ${summary.customers} clientes, ${summary.closedSessions} fechamentos, ` +
        `${summary.creditSales} fiados e ${summary.auditEvents} eventos de auditoria.`,
      );
    }
    for (const [index, admin] of ADMIN_USERS.entries()) {
      await seedAdmin(client, admin, adminPasswordHash, index === 0 ? 'SUPERADMIN' : 'SUPPORT');
      console.log(`Conta administrativa ${admin.email} criada/atualizada sem dados de negócio.`);
    }
  } finally {
    client.release();
  }
  console.log(`Demonstração rica criada. Relatórios históricos: janeiro a abril de ${REPORT_YEAR}.`);
  console.log(`Operadores usam a senha ${OPERATOR_PASSWORD}.`);
}

try {
  await main();
} catch (error) {
  console.error('Falha ao executar a seed:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
