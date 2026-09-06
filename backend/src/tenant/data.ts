import { withTenantTransaction } from '../db.js';

// Projeção específica para operação: nenhuma venda histórica, custo, relatório,
// configuração financeira ou lista de dívidas é transferida ao operador.
export async function loadOperatorData(tenantId: string) {
  return withTenantTransaction(tenantId, async client => {
    const settings = (await client.query(`SELECT business_name,business_category,offering,controls_stock,onboarding_completed,
      receipt_settings,idle_timeout_minutes,view_period FROM business_settings WHERE business_id=$1`, [tenantId])).rows[0];
    const products = (await client.query(`SELECT id,kind,name,barcode,sale_price,stock_quantity,minimum_quantity,
      service_duration::text FROM products WHERE business_id=$1 AND active ORDER BY name`, [tenantId])).rows;
    const customers = (await client.query('SELECT id,name FROM customers WHERE business_id=$1 ORDER BY name', [tenantId])).rows;
    const categories = (await client.query('SELECT id,name FROM categories WHERE business_id=$1 ORDER BY name', [tenantId])).rows;
    const sessions = (await client.query(`SELECT id,responsible,opened_at,opening_balance,status FROM cash_sessions
      WHERE business_id=$1 AND status='open'`, [tenantId])).rows;
    const sales = (await client.query(`SELECT si.id,si.id AS item_id,s.id AS sale_id,si.product_id,si.product_name,
      si.quantity,si.returned_quantity,si.unit_price,s.cash_session_id,s.sold_at,s.payment_method,p.kind AS product_kind
      FROM sale_items si JOIN sales s ON s.business_id=si.business_id AND s.id=si.sale_id
      LEFT JOIN products p ON p.business_id=si.business_id AND p.id=si.product_id
      WHERE si.business_id=$1 AND s.status='completed' AND s.cash_session_id IN
        (SELECT id FROM cash_sessions WHERE business_id=$1 AND status='open')
      ORDER BY s.sold_at DESC,si.created_at`, [tenantId])).rows;
    const current = sessions[0];
    return {
      config: settings ? { nome: settings.business_name, categoria:settings.business_category, oferta: settings.offering, controlaEstoque: settings.controls_stock,
        onboardingConcluido: settings.onboarding_completed, receiptSettings: settings.receipt_settings,
        idleTimeoutMinutes: settings.idle_timeout_minutes, viewPeriod:settings.view_period, despesasFixas:[],
        relatorio:{frequencia:'nenhum',porEmail:false} } : null,
      produtos: products.map(p => ({ id:p.id,type:p.kind,nome:p.name,codigoBarras:p.barcode,precoVenda:Number(p.sale_price),
        quantidade:p.stock_quantity === null ? undefined : Number(p.stock_quantity),
        quantidadeMinima:p.minimum_quantity === null ? undefined : Number(p.minimum_quantity),duracao:p.service_duration })),
      clientes: customers.map(c => ({id:c.id,nome:c.name})), categorias:categories.map(c=>({id:c.id,nome:c.name})),
      caixaAtual: current ? { id:current.id,responsavel:current.responsible,abertoEm:new Date(current.opened_at).toISOString(),
        valorInicial:Number(current.opening_balance),status:current.status,vendasDinheiro:0,vendasPix:0,vendasCartao:0,
        vendasFiado:0,suprimentos:0,sangrias:0,saidasOutros:0,dinheiroEsperado:Number(current.opening_balance),pendenciasIdentificacao:0 } : null,
      vendas:sales.map(s=>({ id:s.id,saleId:s.sale_id,itemId:s.item_id,caixaSessaoId:s.cash_session_id,
        data:new Date(s.sold_at).toISOString().slice(0,10),createdAt:new Date(s.sold_at).toISOString(),
        descricao:s.product_name,quantidade:Number(s.quantity),quantidadeDevolvida:Number(s.returned_quantity),
        valorUnitario:Number(s.unit_price),formaPagamento:s.payment_method,produtoId:s.product_id ?? undefined,
        tipoItem:s.product_kind ?? undefined })),
      contas:[],lancamentosManuais:[],transacoes:[],fechamentosCaixa:[],
    };
  });
}
