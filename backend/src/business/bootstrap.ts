import { withTenantTransaction } from '../db.js';

type UserIdentity = {
  id: string;
  email: string;
  name: string | null;
};

function isoDate(value: Date | string | null): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString().slice(0, 10);
}

export async function loadBootstrapData(user: UserIdentity) {
  return withTenantTransaction(user.id, async (client) => {
    // Um PoolClient do pg processa uma consulta por vez. Manter a sequência
    // explícita evita sobrepor client.query(), comportamento depreciado no pg 8
    // e que será rejeitado no pg 9.
    const settingsResult = await client.query(`
          SELECT business_name, business_category, offering, controls_stock,
                 daily_sales_goal, report_frequency, report_by_email, report_email,
                 view_period, onboarding_completed, idle_timeout_minutes, receipt_settings
          FROM business_settings
          WHERE business_id = $1
        `, [user.id]);
    const productsResult = await client.query(`
          SELECT p.id, p.kind, p.name, p.barcode, p.sale_price, p.cost_price, p.created_at,
                 p.stock_quantity, p.minimum_quantity, p.service_duration::text,
                 c.name AS category_name,
                 COALESCE((
                   SELECT SUM(si.quantity)
                   FROM sale_items si
                   JOIN sales s ON s.business_id = si.business_id AND s.id = si.sale_id
                   WHERE si.business_id = p.business_id AND si.product_id = p.id
                     AND s.status = 'completed'
                 ), 0) AS sold_quantity
          FROM products p
          LEFT JOIN categories c ON c.business_id = p.business_id AND c.id = p.category_id
          WHERE p.business_id = $1 AND p.active
          ORDER BY p.created_at, p.name
        `, [user.id]);
    const categoriesResult = await client.query(`
          SELECT id, name
          FROM categories
          WHERE business_id = $1
          ORDER BY created_at, name
        `, [user.id]);
    const salesResult = await client.query(`
          SELECT si.id, si.id AS item_id, s.id AS sale_id, si.product_id, si.product_name,
                 si.quantity, si.returned_quantity, si.unit_price,
                 s.cash_session_id, s.sold_at, s.payment_method, s.returned_amount,
                 p.kind AS product_kind
          FROM sale_items si
          JOIN sales s ON s.business_id = si.business_id AND s.id = si.sale_id
          LEFT JOIN products p ON p.business_id = si.business_id AND p.id = si.product_id
          WHERE si.business_id = $1 AND s.status = 'completed'
          ORDER BY s.sold_at, si.created_at
        `, [user.id]);
    const customersResult = await client.query(`
          SELECT id, name, phone
          FROM customers
          WHERE business_id = $1
          ORDER BY created_at, name
        `, [user.id]);
    const creditsResult = await client.query(`
          SELECT cs.id, cs.sale_id, cs.customer_id, cs.amount, cs.paid_amount, cs.status,
                 cs.due_date, cs.paid_at, cs.created_at,
                 (
                   SELECT si.id
                   FROM sale_items si
                   WHERE si.business_id = cs.business_id AND si.sale_id = cs.sale_id
                   ORDER BY si.created_at, si.id
                   LIMIT 1
                 ) AS sale_item_id,
                 COALESCE(s.description, 'Venda fiado') AS description
          FROM credit_sales cs
          JOIN sales s ON s.business_id = cs.business_id AND s.id = cs.sale_id
          WHERE cs.business_id = $1
          ORDER BY cs.created_at
        `, [user.id]);
    const expensesResult = await client.query(`
          SELECT fe.id, fe.description, fe.amount, fe.recurrence,
                 payment.occurred_at AS paid_at, payment.payment_method
          FROM fixed_expenses fe
          LEFT JOIN LATERAL (
            SELECT t.occurred_at, t.payment_method
            FROM transactions t
            WHERE t.business_id = fe.business_id
              AND t.fixed_expense_id = fe.id
              AND t.source = 'despesa_fixa'
              AND t.occurred_at >= CASE fe.recurrence
                WHEN 'weekly' THEN date_trunc('week', now())
                WHEN 'monthly' THEN date_trunc('month', now())
                WHEN 'yearly' THEN date_trunc('year', now())
                ELSE '-infinity'::timestamptz
              END
            ORDER BY t.occurred_at DESC
            LIMIT 1
          ) payment ON true
          WHERE fe.business_id = $1 AND fe.active AND fe.recurrence IN ('weekly', 'monthly')
          ORDER BY fe.created_at, fe.description
        `, [user.id]);
    const manualResult = await client.query(`
          SELECT id, cash_session_id, occurred_at, type, description, amount, payment_method,
                 movement_kind, entry_kind, expense_kind, identification_pending
          FROM transactions
          WHERE business_id = $1 AND source IN ('ajuste', 'despesa_avulsa')
          ORDER BY occurred_at
        `, [user.id]);
    const transactionsResult = await client.query(`
          SELECT t.id, t.cash_session_id, t.type, t.source, t.description,
                 t.payment_method, t.amount, t.occurred_at,
                 cs.customer_id, c.name AS customer_name
          FROM transactions t
          LEFT JOIN credit_sales cs
            ON cs.business_id = t.business_id AND cs.id = t.credit_sale_id
          LEFT JOIN customers c
            ON c.business_id = cs.business_id AND c.id = cs.customer_id
          WHERE t.business_id = $1
          ORDER BY t.occurred_at, t.created_at
        `, [user.id]);
    const cashResult = await client.query(`
          SELECT cs.id, cs.responsible, cs.opened_at, cs.closed_at, cs.status,
                 cs.opening_balance, cs.closing_balance, cs.expected_balance, cs.difference,
                 COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.type = 'entrada' AND t.payment_method = 'dinheiro'
                     AND t.movement_kind <> 'suprimento'), 0) AS sales_cash,
                 COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.type = 'entrada' AND t.payment_method = 'pix'
                     AND t.movement_kind <> 'suprimento'), 0) AS sales_pix,
                 COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.type = 'entrada' AND t.payment_method IN ('cartao_credito', 'cartao_debito')
                     AND t.movement_kind <> 'suprimento'), 0) AS sales_card,
                 COALESCE((SELECT SUM(s.total_amount) FROM sales s
                   WHERE s.business_id = cs.business_id AND s.cash_session_id = cs.id
                     AND s.status = 'completed' AND s.payment_method = 'fiado'), 0) AS sales_credit,
                 COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.type = 'entrada' AND t.payment_method = 'dinheiro'
                     AND t.movement_kind = 'suprimento'), 0) AS supplies,
                 COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.type = 'saida' AND t.payment_method = 'dinheiro'), 0) AS withdrawals,
                 COALESCE((SELECT SUM(t.amount) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.type = 'saida' AND t.payment_method <> 'dinheiro'), 0) AS other_outflows,
                 COALESCE((SELECT COUNT(*) FROM transactions t
                   WHERE t.business_id = cs.business_id AND t.cash_session_id = cs.id
                     AND t.identification_pending), 0)::integer AS pending_count
          FROM cash_sessions cs
          WHERE cs.business_id = $1
          ORDER BY cs.opened_at DESC
        `, [user.id]);

    const hasBusinessData =
      settingsResult.rowCount || productsResult.rowCount || categoriesResult.rowCount || salesResult.rowCount || expensesResult.rowCount ||
      creditsResult.rowCount || manualResult.rowCount || transactionsResult.rowCount || cashResult.rowCount;
    if (!hasBusinessData) return null;

    const fixedExpenses = expensesResult.rows.map((expense) => ({
      id: expense.id,
      nome: expense.description,
      valor: Number(expense.amount),
      recorrencia: expense.recurrence === 'weekly' ? 'semanal' : 'mensal',
      quitado: Boolean(expense.paid_at),
      pagoEm: expense.paid_at ? new Date(expense.paid_at).toISOString() : undefined,
      formaPagamento: expense.payment_method ?? undefined,
    }));

    const cashSessions = cashResult.rows.map((session) => ({
      id: session.id,
      status: session.status,
      responsavel: session.responsible,
      abertoEm: new Date(session.opened_at).toISOString(),
      fechadoEm: session.closed_at ? new Date(session.closed_at).toISOString() : undefined,
      valorInicial: Number(session.opening_balance),
      vendasDinheiro: Number(session.sales_cash),
      vendasPix: Number(session.sales_pix),
      vendasCartao: Number(session.sales_card),
      vendasFiado: Number(session.sales_credit),
      suprimentos: Number(session.supplies),
      sangrias: Number(session.withdrawals),
      saidasOutros: Number(session.other_outflows),
      dinheiroEsperado: Number(
        session.expected_balance ??
          Number(session.opening_balance) + Number(session.sales_cash) + Number(session.supplies) - Number(session.withdrawals),
      ),
      dinheiroContado: session.closing_balance === null ? undefined : Number(session.closing_balance),
      diferenca: session.difference === null ? undefined : Number(session.difference),
      pendenciasIdentificacao: Number(session.pending_count),
    }));

    const settings = settingsResult.rows[0];
    return {
      config: settings ? {
        nome: settings.business_name,
        categoria: settings.business_category,
        oferta: settings.offering,
        controlaEstoque: settings.controls_stock,
        metaDiariaVendas: settings.daily_sales_goal === null ? undefined : Number(settings.daily_sales_goal),
        despesasFixas: fixedExpenses,
        relatorio: {
          frequencia: settings.report_frequency,
          porEmail: settings.report_by_email,
          email: settings.report_email ?? undefined,
        },
        viewPeriod: settings.view_period,
        onboardingConcluido: settings.onboarding_completed,
        idleTimeoutMinutes: settings.idle_timeout_minutes,
        receiptSettings: settings.receipt_settings,
      } : {
        nome: `${user.name ?? user.email.split('@')[0]} — Demonstração`,
        categoria: 'Alimentação (Mercado, Padaria...)',
        oferta: 'ambos',
        controlaEstoque: true,
        metaDiariaVendas: 500,
        despesasFixas: fixedExpenses,
        relatorio: { frequencia: 'ambos', porEmail: false },
        viewPeriod: 'day',
        onboardingConcluido: true,
      },
      produtos: productsResult.rows.map((product) => ({
        id: product.id,
        type: product.kind,
        nome: product.name,
        codigoBarras: product.barcode ?? undefined,
        categoria: product.category_name ?? undefined,
        precoVenda: Number(product.sale_price),
        custo: Number(product.cost_price),
        quantidade: product.kind === 'product' ? Number(product.stock_quantity ?? 0) : undefined,
        quantidadeMinima: product.kind === 'product' ? Number(product.minimum_quantity ?? 0) : undefined,
        duracao: product.kind === 'service' ? product.service_duration ?? undefined : undefined,
        createdAt: new Date(product.created_at).toISOString(),
        quantidadeVendida: Number(product.sold_quantity),
      })),
      categorias: categoriesResult.rows.map((category) => ({
        id: category.id,
        nome: category.name,
      })),
      vendas: salesResult.rows.map((sale) => ({
        id: sale.id,
        saleId: sale.sale_id,
        itemId: sale.item_id,
        caixaSessaoId: sale.cash_session_id ?? undefined,
        data: isoDate(sale.sold_at),
        createdAt: new Date(sale.sold_at).toISOString(),
        descricao: sale.product_name,
        quantidade: Number(sale.quantity),
        quantidadeDevolvida: Number(sale.returned_quantity),
        valorUnitario: Number(sale.unit_price),
        formaPagamento: sale.payment_method,
        produtoId: sale.product_id ?? undefined,
        tipoItem: sale.product_kind ?? undefined,
      })),
      clientes: customersResult.rows.map((customer) => ({
        id: customer.id,
        nome: customer.name,
        telefone: customer.phone ?? undefined,
      })),
      contas: creditsResult.rows.map((credit) => ({
        id: credit.id,
        tipo: 'receber',
        descricao: credit.description,
        valor: credit.status === 'pago'
          ? Number(credit.amount)
          : Number(credit.amount) - Number(credit.paid_amount),
        vencimento: isoDate(credit.due_date ?? credit.created_at),
        quitado: credit.status === 'pago',
        dataQuitacao: isoDate(credit.paid_at),
        quitadoEm: credit.paid_at ? new Date(credit.paid_at).toISOString() : undefined,
        origemVendaId: credit.sale_item_id ?? undefined,
        clienteId: credit.customer_id,
      })),
      lancamentosManuais: manualResult.rows.map((entry) => ({
        id: entry.id,
        data: isoDate(entry.occurred_at),
        createdAt: new Date(entry.occurred_at).toISOString(),
        tipo: entry.type,
        descricao: entry.description ?? 'Lançamento manual',
        valor: Number(entry.amount),
        formaPagamento: entry.payment_method ?? undefined,
        tipoEntrada: entry.entry_kind ?? undefined,
        tipoDespesa: entry.expense_kind ?? undefined,
        movimentoCaixa: entry.movement_kind,
        identificacaoPendente: entry.identification_pending,
        caixaSessaoId: entry.cash_session_id ?? undefined,
      })),
      transacoes: transactionsResult.rows.map((transaction) => ({
        id: transaction.id,
        caixaSessaoId: transaction.cash_session_id ?? undefined,
        tipo: transaction.type,
        origem: transaction.source,
        descricao: transaction.description ?? 'Movimentação financeira',
        valor: Number(transaction.amount),
        formaPagamento: transaction.payment_method,
        ocorridoEm: new Date(transaction.occurred_at).toISOString(),
        clienteId: transaction.customer_id ?? undefined,
        clienteNome: transaction.customer_name ?? undefined,
      })),
      caixaAtual: cashSessions.find((session) => session.status === 'open') ?? null,
      fechamentosCaixa: cashSessions.filter((session) => session.status === 'closed'),
    };
  });
}
