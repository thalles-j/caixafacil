import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FunnelSimple,
  MagnifyingGlass,
  Receipt,
  X,
} from '@phosphor-icons/react';
import FinanceNav from '../components/FinanceNav';
import Pagination from '../components/Pagination';
import { useAppData } from '../context/AppDataContext';
import { formatCurrency, formatDate } from '../lib/format';
import { formaPagamentoLabel, obterMovimentacoesFinanceiras, obterVendas } from '../lib/movements';
import { paginateItems } from '../lib/pagination';
import { entryTypeOptionsForOffer } from '../lib/offering';
import type { FormaPagamento, TipoEntrada } from '../types';

export type ModoMovimentacoes = 'todas' | 'vendas' | 'saidas';
type FiltroTipoEntrada = 'todas' | TipoEntrada;

const configuracao = {
  todas: {
    titulo: 'Movimentações',
    subtitulo: 'Todas as entradas e saídas efetivadas no caixa.',
    vazio: 'Nenhuma movimentação encontrada.',
  },
  vendas: {
    titulo: 'Entradas',
    subtitulo: 'Pesquise entradas e filtre por período ou forma de pagamento.',
    vazio: 'Nenhuma entrada encontrada.',
  },
  saidas: {
    titulo: 'Saídas e despesas',
    subtitulo: 'Despesas pagas e demais valores que saíram do caixa.',
    vazio: 'Nenhuma saída encontrada.',
  },
} satisfies Record<ModoMovimentacoes, { titulo: string; subtitulo: string; vazio: string }>;

export default function Movimentacoes({ modo }: { modo: ModoMovimentacoes }) {
  const { data } = useAppData();
  const [busca, setBusca] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<'todas' | FormaPagamento>('todas');
  const [tipoEntrada, setTipoEntrada] = useState<FiltroTipoEntrada>('todas');
  const [filtrosMobileAbertos, setFiltrosMobileAbertos] = useState(false);
  const [pagina, setPagina] = useState(1);
  const texto = configuracao[modo];
  const opcoesFiltroEntrada: ReadonlyArray<{ valor: FiltroTipoEntrada; label: string }> = [
    { valor: 'todas', label: 'Todas' },
    ...entryTypeOptionsForOffer(data.config?.oferta).map((opcao) => ({
      valor: opcao.valor,
      label: `${opcao.label}s`,
    })),
  ];
  const tipoEntradaEfetivo = opcoesFiltroEntrada.some((opcao) => opcao.valor === tipoEntrada)
    ? tipoEntrada
    : 'todas';

  const movimentacoes = useMemo(() => {
    const base = modo === 'vendas' ? obterVendas(data) : obterMovimentacoesFinanceiras(data);
    const porTipo =
      modo === 'saidas'
          ? base.filter((movimento) => movimento.tipo === 'saida')
          : base;
    const termo = busca.trim().toLocaleLowerCase('pt-BR');

    return porTipo.filter((movimento) => {
      const correspondeBusca =
        !termo || `${movimento.descricao} ${movimento.detalhe}`.toLocaleLowerCase('pt-BR').includes(termo);
      const correspondeInicio = !dataInicial || movimento.data >= dataInicial;
      const correspondeFim = !dataFinal || movimento.data <= dataFinal;
      const correspondePagamento =
        modo !== 'vendas' || formaPagamento === 'todas' || movimento.formaPagamento === formaPagamento;
      const correspondeTipoEntrada =
        modo !== 'vendas' || tipoEntradaEfetivo === 'todas' || movimento.tipoEntrada === tipoEntradaEfetivo;
      return correspondeBusca && correspondeInicio && correspondeFim && correspondePagamento && correspondeTipoEntrada;
    });
  }, [busca, data, dataFinal, dataInicial, formaPagamento, modo, tipoEntradaEfetivo]);

  const total = movimentacoes.reduce(
    (soma, movimento) => soma + (modo === 'todas' && movimento.tipo === 'saida' ? -movimento.valor : movimento.valor),
    0,
  );
  const movimentacoesPaginadas = paginateItems(movimentacoes, pagina);

  const limparFiltros = () => {
    setBusca('');
    setDataInicial('');
    setDataFinal('');
    setFormaPagamento('todas');
    setTipoEntrada('todas');
    setPagina(1);
  };

  const filtrosAtivos = Boolean(
    busca || dataInicial || dataFinal || formaPagamento !== 'todas' || tipoEntradaEfetivo !== 'todas',
  );
  const quantidadeFiltrosAvancados =
    Number(Boolean(dataInicial)) + Number(Boolean(dataFinal)) + Number(formaPagamento !== 'todas') +
    Number(tipoEntradaEfetivo !== 'todas');

  return (
    <div className="fade-in">
      <h2 className="font-display text-2xl font-bold text-ink">{texto.titulo}</h2>
      <p className="mt-1 text-sm text-ink-soft">{texto.subtitulo}</p>

      <FinanceNav />

      <section className="mb-4 rounded-2xl border border-line bg-paper-raised p-3 shadow-sm md:p-4">
        <div className="mb-3 flex justify-end text-ink-soft md:hidden">
          <button
            type="button"
            onClick={() => setFiltrosMobileAbertos((aberto) => !aberto)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
              filtrosMobileAbertos || quantidadeFiltrosAvancados > 0
                ? 'bg-ledger/10 text-ledger-strong dark:text-ledger'
                : 'bg-line/40 text-ink-soft'
            }`}
            aria-expanded={filtrosMobileAbertos}
          >
            <FunnelSimple size={15} /> Filtros
            {quantidadeFiltrosAvancados > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-ledger px-1 text-[9px] font-bold text-paper">
                {quantidadeFiltrosAvancados}
              </span>
            )}
          </button>
        </div>
        {modo === 'vendas' && (
          <div
            data-choice-position={
              ['first', 'second', 'third', 'fourth'][
                Math.max(0, opcoesFiltroEntrada.findIndex((opcao) => opcao.valor === tipoEntradaEfetivo))
              ]
            }
            className={`segmented-slider neutral-tabs-selector mb-3 grid rounded-xl border border-line bg-line/40 p-1 ${
              opcoesFiltroEntrada.length === 3
                ? 'segmented-slider-3 grid-cols-3'
                : 'segmented-slider-4 grid-cols-4'
            }`}
            aria-label="Filtrar entradas por tipo"
          >
            {opcoesFiltroEntrada.map(({ valor: valorTipo, label }) => (
              <button
                key={valorTipo}
                type="button"
                aria-pressed={tipoEntradaEfetivo === valorTipo}
                onClick={() => {
                  setTipoEntrada(valorTipo);
                  setPagina(1);
                }}
                className={`selection-option min-w-0 rounded-lg border-0 px-1 py-2 text-xs font-semibold sm:px-3 sm:text-sm ${
                  tipoEntradaEfetivo === valorTipo ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <div
          className={`grid gap-3 ${
            modo === 'vendas'
              ? 'md:grid-cols-2 lg:grid-cols-[minmax(240px,2fr)_minmax(140px,1fr)_minmax(140px,1fr)_minmax(180px,1fr)]'
              : 'md:grid-cols-[minmax(260px,2fr)_minmax(160px,1fr)_minmax(160px,1fr)]'
          }`}
        >
          <label className="block min-w-0">
            <span className="mb-1 hidden text-[10px] font-bold uppercase tracking-wide text-ink-soft md:block">
              Nome ou descrição
            </span>
            <span className="relative block">
              <MagnifyingGlass size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                type="search"
                value={busca}
                onChange={(event) => {
                  setBusca(event.target.value);
                  setPagina(1);
                }}
                aria-label="Pesquisar por nome ou descrição"
                placeholder="Pesquisar por nome ou descrição"
                className="w-full rounded-xl border border-line bg-paper py-2.5 pl-10 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </span>
          </label>
          <label className={`${filtrosMobileAbertos ? 'block' : 'hidden'} md:block`}>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">De</span>
            <input
              type="date"
              value={dataInicial}
              onChange={(event) => {
                setDataInicial(event.target.value);
                setPagina(1);
              }}
              aria-label="Data inicial"
              className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </label>
          <label className={`${filtrosMobileAbertos ? 'block' : 'hidden'} md:block`}>
            <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Até</span>
            <input
              type="date"
              value={dataFinal}
              onChange={(event) => {
                setDataFinal(event.target.value);
                setPagina(1);
              }}
              aria-label="Data final"
              className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </label>
          {modo === 'vendas' && (
            <label className={`${filtrosMobileAbertos ? 'block' : 'hidden'} md:block`}>
              <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Pagamento</span>
              <select
                value={formaPagamento}
                onChange={(event) => {
                  setFormaPagamento(event.target.value as 'todas' | FormaPagamento);
                  setPagina(1);
                }}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              >
                <option value="todas">Todas as formas</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="cartao_credito">Cartão de crédito</option>
                <option value="cartao_debito">Cartão de débito</option>
                <option value="fiado">Fiado</option>
              </select>
            </label>
          )}
        </div>
        {filtrosAtivos && (
          <button onClick={limparFiltros} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink">
            <X size={14} /> Limpar filtros
          </button>
        )}
      </section>

      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{movimentacoes.length} registro(s)</p>
          <p className="text-xs text-ink-soft">Mais recentes primeiro</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
            {modo === 'todas' ? 'Saldo filtrado' : 'Total filtrado'}
          </p>
          <p className={`font-ledger text-xl font-bold tabular-nums ${modo === 'saidas' ? 'text-stamp' : 'text-ledger-strong dark:text-ledger'}`}>
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
        {movimentacoes.length === 0 ? (
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-line/40 text-ink-soft">
              <Receipt size={23} />
            </div>
            <p className="text-sm font-medium text-ink">{texto.vazio}</p>
            <p className="mt-1 text-xs text-ink-soft">Altere os filtros para ampliar a pesquisa.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {movimentacoesPaginadas.items.map((movimento) => {
              const isSaida = movimento.tipo === 'saida';
              const fiadoPendente = Boolean(movimento.fiadoPendente);
              return (
                <li key={`${movimento.origem}-${movimento.id}`} className="flex items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        isSaida
                          ? 'bg-stamp/10 text-stamp'
                          : fiadoPendente
                            ? 'bg-brass/10 text-brass'
                            : 'bg-ledger/10 text-ledger-strong dark:text-ledger'
                      }`}
                    >
                      {isSaida ? <ArrowDown size={18} /> : <ArrowUp size={18} />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{movimento.descricao}</p>
                      <p className={`truncate text-xs ${fiadoPendente ? 'text-brass' : 'text-ink-soft'}`}>
                        {movimento.detalhe}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={`font-ledger text-sm font-bold tabular-nums ${
                        isSaida ? 'text-stamp' : fiadoPendente ? 'text-brass' : 'text-ledger-strong dark:text-ledger'
                      }`}
                    >
                      {isSaida ? '- ' : fiadoPendente ? '' : '+ '}
                      {formatCurrency(movimento.valor)}
                    </p>
                    <p className="mt-1 text-[11px] text-ink-soft">{formatDate(movimento.data)}</p>
                    {modo === 'vendas' && movimento.formaPagamento && !fiadoPendente && (
                      <p className="mt-0.5 text-[10px] text-ink-soft">{formaPagamentoLabel(movimento.formaPagamento)}</p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <Pagination
        currentPage={movimentacoesPaginadas.currentPage}
        totalItems={movimentacoes.length}
        onPageChange={setPagina}
        itemLabel="movimentações"
      />
    </div>
  );
}
