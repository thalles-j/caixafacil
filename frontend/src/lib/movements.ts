import type { AppData, FormaPagamento, Produto, TipoEntrada, TipoLancamento } from '../types';

export type OrigemMovimentacao = 'venda' | 'lancamento' | 'conta';

export interface Movimentacao {
  id: string;
  data: string;
  descricao: string;
  valor: number;
  tipo: TipoLancamento;
  origem: OrigemMovimentacao;
  categoria: 'venda' | 'entrada' | 'despesa';
  detalhe: string;
  formaPagamento?: FormaPagamento;
  itemType?: Produto['type'];
  tipoEntrada?: TipoEntrada;
  fiadoPendente?: boolean;
  ocorridoEm: string;
  ordem: number;
}

function ordenarMaisRecentesPrimeiro(movimentacoes: Movimentacao[]): Movimentacao[] {
  return movimentacoes.sort((a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm) || b.ordem - a.ordem);
}

export function formaPagamentoLabel(forma: FormaPagamento): string {
  const labels: Record<FormaPagamento, string> = {
    dinheiro: 'Dinheiro',
    pix: 'Pix',
    cartao_credito: 'Cartão de crédito',
    cartao_debito: 'Cartão de débito',
    fiado: 'Fiado',
  };
  return labels[forma];
}

/** Movimentos que alteraram o caixa. Vendas fiado só aparecem depois da baixa. */
export function obterMovimentacoesFinanceiras(data: AppData): Movimentacao[] {
  const clientes = new Map(data.clientes.map((cliente) => [cliente.id, cliente.nome]));

  const vendas: Movimentacao[] = data.vendas
    .filter((venda) => venda.formaPagamento !== 'fiado')
    .map((venda, index) => ({
      id: venda.id,
      data: venda.data,
      descricao: venda.descricao,
      valor: venda.quantidade * venda.valorUnitario,
      tipo: 'entrada',
      origem: 'venda',
      categoria: 'venda',
      detalhe: `Venda · ${formaPagamentoLabel(venda.formaPagamento)}`,
      formaPagamento: venda.formaPagamento,
      ocorridoEm: venda.createdAt ?? `${venda.data}T12:00:00.000Z`,
      ordem: index * 3 + 2,
    }));

  const lancamentos: Movimentacao[] = data.lancamentosManuais.map((lancamento, index) => ({
    id: lancamento.id,
    data: lancamento.data,
    descricao: lancamento.descricao,
    valor: lancamento.valor,
    tipo: lancamento.tipo,
    origem: 'lancamento',
    categoria: lancamento.tipo === 'entrada' ? 'entrada' : 'despesa',
    detalhe: `${lancamento.tipo === 'entrada' ? 'Entrada manual' : 'Saída manual'}${
      lancamento.identificacaoPendente ? ' · identificação pendente' : ''
    }${
      lancamento.formaPagamento ? ` · ${formaPagamentoLabel(lancamento.formaPagamento)}` : ''
    }`,
    formaPagamento: lancamento.formaPagamento,
    ocorridoEm: lancamento.createdAt ?? `${lancamento.data}T23:00:00.000Z`,
    ordem: index * 3 + 1,
  }));

  const contas: Movimentacao[] = data.contas
    .filter((conta) => conta.quitado && conta.dataQuitacao)
    .map((conta, index) => {
      const nomeCliente = conta.clienteId ? clientes.get(conta.clienteId) : undefined;
      const recebimentoFiado = conta.tipo === 'receber' && Boolean(conta.origemVendaId);
      return {
        id: conta.id,
        data: conta.dataQuitacao!,
        descricao: nomeCliente ? `${nomeCliente} — ${conta.descricao}` : conta.descricao,
        valor: conta.valor,
        tipo: conta.tipo === 'receber' ? 'entrada' : 'saida',
        origem: 'conta',
        categoria: conta.tipo === 'receber' ? 'entrada' : 'despesa',
        detalhe: recebimentoFiado ? 'Pagamento de fiado' : conta.tipo === 'receber' ? 'Conta recebida' : 'Despesa paga',
        ocorridoEm: conta.quitadoEm ?? `${conta.dataQuitacao!}T20:00:00.000Z`,
        ordem: index * 3,
      };
    });

  const despesasFixas: Movimentacao[] = (data.config?.despesasFixas ?? [])
    .filter((despesa) => despesa.quitado && despesa.pagoEm)
    .map((despesa, index) => ({
      id: despesa.id,
      data: despesa.pagoEm!.slice(0, 10),
      descricao: despesa.nome,
      valor: despesa.valor,
      tipo: 'saida',
      origem: 'conta',
      categoria: 'despesa',
      detalhe: `Conta fixa paga${despesa.formaPagamento ? ` · ${formaPagamentoLabel(despesa.formaPagamento)}` : ''}`,
      formaPagamento: despesa.formaPagamento,
      ocorridoEm: despesa.pagoEm!,
      ordem: index * 3,
    }));

  return ordenarMaisRecentesPrimeiro([...vendas, ...lancamentos, ...contas, ...despesasFixas]);
}

/** Histórico comercial completo, incluindo fiado ainda não recebido. */
export function obterVendas(data: AppData): Movimentacao[] {
  const produtosPorId = new Map(data.produtos.map((produto) => [produto.id, produto]));
  const contasPorVenda = new Map(
    data.contas.filter((conta) => conta.origemVendaId).map((conta) => [conta.origemVendaId!, conta]),
  );

  const vendas: Movimentacao[] = data.vendas.map((venda, index) => {
      const conta = contasPorVenda.get(venda.id);
      const fiadoPendente = venda.formaPagamento === 'fiado' && !conta?.quitado;
      const itemType = venda.produtoId ? produtosPorId.get(venda.produtoId)?.type : venda.tipoItem;
      return {
        id: venda.id,
        data: venda.data,
        descricao: venda.descricao,
        valor: venda.quantidade * venda.valorUnitario,
        tipo: 'entrada',
        origem: 'venda',
        categoria: 'venda',
        detalhe:
          venda.formaPagamento === 'fiado'
            ? fiadoPendente
              ? 'Fiado · aguardando pagamento'
              : `Fiado · recebido${conta?.dataQuitacao ? ` em ${conta.dataQuitacao}` : ''}`
            : `${venda.quantidade} un. · ${formaPagamentoLabel(venda.formaPagamento)}`,
        formaPagamento: venda.formaPagamento,
        itemType,
        tipoEntrada: itemType === 'product' ? 'produto' : itemType === 'service' ? 'servico' : undefined,
        fiadoPendente,
        ocorridoEm: venda.createdAt ?? `${venda.data}T12:00:00.000Z`,
        ordem: index,
      };
    });

  const entradasRapidas: Movimentacao[] = data.lancamentosManuais
    .filter((lancamento) => lancamento.tipo === 'entrada' && lancamento.movimentoCaixa !== 'suprimento')
    .map((lancamento, index) => ({
      id: lancamento.id,
      data: lancamento.data,
      descricao: lancamento.descricao,
      valor: lancamento.valor,
      tipo: 'entrada',
      origem: 'lancamento',
      categoria: 'entrada',
      detalhe: `${lancamento.tipoEntrada === 'gorjeta' ? 'Gorjeta' : 'Entrada rápida'}${
        lancamento.identificacaoPendente ? ' · identificação pendente' : ''
      }${lancamento.formaPagamento ? ` · ${formaPagamentoLabel(lancamento.formaPagamento)}` : ''}`,
      formaPagamento: lancamento.formaPagamento,
      itemType:
        lancamento.tipoEntrada === 'produto'
          ? 'product'
          : lancamento.tipoEntrada === 'servico'
            ? 'service'
            : undefined,
      tipoEntrada: lancamento.tipoEntrada,
      fiadoPendente: false,
      ocorridoEm: lancamento.createdAt ?? `${lancamento.data}T23:00:00.000Z`,
      ordem: data.vendas.length + index,
    }));

  return ordenarMaisRecentesPrimeiro([...vendas, ...entradasRapidas]);
}
