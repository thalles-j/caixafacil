import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import {
  Eye,
  EyeSlash,
  TrendUp,
  TrendDown,
  Receipt,
  HandCoins,
  Package,
  ArrowUp,
  ArrowDown,
  ArrowUpRight,
  ArrowDownRight,
  Calculator,
  ClockCountdown,
  WarningCircle,
  Info,
  ChartBar,
  Newspaper,
  PencilSimple,
  Trash,
  CaretRight,
  Money,
  QrCode,
  CreditCard,
  CheckCircle,
} from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import Modal from '../components/Modal';
import { formatCurrency, parseMoney, sanitizeIntegerInput, sanitizeMoneyInput, todayISO } from '../lib/format';
import { TIPOS_DESPESA } from '../types';
import type { FormaPagamento, LancamentoManual, TipoDespesa, TipoEntrada, Venda } from '../types';
import { obterMovimentacoesFinanceiras } from '../lib/movements';
import { defaultEntryType, entryTypeOptionsForOffer } from '../lib/offering';
import type { LayoutOutletContext } from '../components/Layout';

const diaSemanaCurto = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' });

type ItemParaExcluir = { tipo: 'venda' | 'lancamento'; id: string; label: string };
type FormaPagamentoLancamento = 'dinheiro' | 'pix' | 'cartao_credito';

const FORMAS_LANCAMENTO: {
  value: FormaPagamentoLancamento;
  label: string;
  Icon: typeof Money;
}[] = [
  { value: 'dinheiro', label: 'Dinheiro', Icon: Money },
  { value: 'pix', label: 'Pix', Icon: QrCode },
  { value: 'cartao_credito', label: 'Cartão', Icon: CreditCard },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { informacoesVisiveis, alternarInformacoes } = useOutletContext<LayoutOutletContext>();
  const {
    data,
    saldoCaixa,
    vendasHoje,
    resumoPeriodo,
    lucroEstimadoHoje,
    vendasUltimos7Dias,
    contasAPagarHoje,
    contasAReceberEmAberto,
    contasVencendoEmBreve,
    contasVencidas,
    produtosEstoqueBaixo,
    registrarLancamentoNoBanco,
    editarVenda,
    removerVenda,
    editarLancamentoManual,
    removerLancamentoManual,
  } = useAppData();
  const oferta = data.config?.oferta ?? 'ambos';
  const opcoesTipoEntrada = entryTypeOptionsForOffer(oferta);
  const tipoEntradaPadrao = defaultEntryType(oferta);

  const [lancamentoModalAberto, setLancamentoModalAberto] = useState(false);
  const [lancamentoTipo, setLancamentoTipo] = useState<'entrada' | 'saida'>('entrada');
  const [lancamentoDescricao, setLancamentoDescricao] = useState('');
  const [lancamentoValor, setLancamentoValor] = useState('');
  const [lancamentoCategoria, setLancamentoCategoria] = useState<TipoDespesa | ''>('');
  const [lancamentoPagamento, setLancamentoPagamento] = useState<FormaPagamentoLancamento>('dinheiro');
  const [lancamentoTipoEntrada, setLancamentoTipoEntrada] = useState<TipoEntrada>(tipoEntradaPadrao);
  const [lancamentoSalvando, setLancamentoSalvando] = useState(false);
  const [lancamentoErro, setLancamentoErro] = useState<string | null>(null);
  const [vendaEditando, setVendaEditando] = useState<Venda | null>(null);
  const [lancamentoEditando, setLancamentoEditando] = useState<LancamentoManual | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<ItemParaExcluir | null>(null);
  const hoje = todayISO();
  const controlaEstoque = data.config?.controlaEstoque ?? true;
  const viewPeriod = data.config?.viewPeriod ?? 'day';
  const sufixoPeriodo = viewPeriod === 'day' ? 'Hoje' : '(7 dias)';
  const lancamentoTipoEntradaEfetivo = opcoesTipoEntrada.some(
    (opcao) => opcao.valor === lancamentoTipoEntrada,
  )
    ? lancamentoTipoEntrada
    : tipoEntradaPadrao;

  const metaDiaria = data.config?.metaDiariaVendas ?? 0;
  const progressoMeta = metaDiaria > 0 ? Math.min(100, Math.round((vendasHoje / metaDiaria) * 100)) : 0;

  const totalAPagarHoje = contasAPagarHoje.reduce((sum, c) => sum + c.valor, 0);
  const totalAReceber = contasAReceberEmAberto.reduce((sum, c) => sum + c.valor, 0);
  // contasVencidas mistura 'pagar' e 'receber' — separa para linkar "Ver" na aba certa de Finanças
  const contasVencidasPagar = contasVencidas.filter((c) => c.tipo === 'pagar');
  const contasVencidasReceber = contasVencidas.filter((c) => c.tipo === 'receber');
  const clientesEmAberto = useMemo(() => {
    const comCliente = new Set(contasAReceberEmAberto.filter((c) => c.clienteId).map((c) => c.clienteId));
    const semCliente = contasAReceberEmAberto.filter((c) => !c.clienteId).length;
    return comCliente.size + semCliente;
  }, [contasAReceberEmAberto]);

  const handleSalvarLancamento = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const valor = parseMoney(lancamentoValor);
    const categoriaLabel = TIPOS_DESPESA.find((item) => item.valor === lancamentoCategoria)?.label ?? '';
    const descricao = lancamentoDescricao.trim() || (lancamentoTipo === 'saida' ? categoriaLabel : '') || '';
    if (!descricao || valor <= 0) return;

    setLancamentoSalvando(true);
    setLancamentoErro(null);
    try {
      await registrarLancamentoNoBanco({
        tipo: lancamentoTipo,
        descricao,
        valor,
        formaPagamento: lancamentoPagamento,
        tipoEntrada: lancamentoTipo === 'entrada' ? lancamentoTipoEntradaEfetivo : undefined,
        tipoDespesa: lancamentoTipo === 'saida' ? lancamentoCategoria || undefined : undefined,
        movimentoCaixa: 'regular',
      });

      setLancamentoModalAberto(false);
      setLancamentoDescricao('');
      setLancamentoValor('');
      setLancamentoCategoria('');
      setLancamentoPagamento('dinheiro');
      setLancamentoTipoEntrada(tipoEntradaPadrao);
    } catch (error) {
      setLancamentoErro(error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setLancamentoSalvando(false);
    }
  };

  const handleEditarVendaSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!vendaEditando) return;
    const form = new FormData(e.currentTarget);
    const descricao = String(form.get('descricao') ?? '').trim();
    const quantidade = Number(form.get('quantidade') ?? vendaEditando.quantidade);
    const valorUnitario = parseMoney(String(form.get('valorUnitario') ?? '0'));
    const data_ = String(form.get('data') ?? vendaEditando.data);
    const formaPagamento = String(form.get('formaPagamento') ?? vendaEditando.formaPagamento) as FormaPagamento;

    if (!descricao || quantidade <= 0 || valorUnitario <= 0) return;

    const sucesso = editarVenda(vendaEditando.id, { descricao, quantidade, valorUnitario, data: data_, formaPagamento });
    if (!sucesso) {
      alert(
        'Não foi possível alterar a forma de pagamento: a conta a receber gerada por essa venda fiado já foi paga.',
      );
      return;
    }
    setVendaEditando(null);
  };

  const handleEditarLancamentoSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!lancamentoEditando) return;
    const form = new FormData(e.currentTarget);
    const descricao = String(form.get('descricao') ?? '').trim();
    const valor = parseMoney(String(form.get('valor') ?? '0'));
    const data_ = String(form.get('data') ?? lancamentoEditando.data);

    if (!descricao || valor <= 0) return;

    editarLancamentoManual(lancamentoEditando.id, { descricao, valor, data: data_ });
    setLancamentoEditando(null);
  };

  const confirmarExclusao = () => {
    if (!itemParaExcluir) return;
    if (itemParaExcluir.tipo === 'venda') {
      const sucesso = removerVenda(itemParaExcluir.id);
      if (!sucesso) {
        alert('Não foi possível excluir: a conta a receber gerada por essa venda fiado já foi paga.');
        setItemParaExcluir(null);
        return;
      }
    } else {
      removerLancamentoManual(itemParaExcluir.id);
    }
    setItemParaExcluir(null);
  };

  const emAltaHoje = useMemo(() => {
    const vendasHojeList = data.vendas.filter((v) => v.data === hoje);
    const porDescricao = new Map<string, number>();
    vendasHojeList.forEach((v) => {
      porDescricao.set(v.descricao, (porDescricao.get(v.descricao) ?? 0) + v.quantidade);
    });
    return Array.from(porDescricao.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [data.vendas, hoje]);

  const movimentacoesRecentes = useMemo(() => obterMovimentacoesFinanceiras(data).slice(0, 5), [data]);

  const maxHistorico = Math.max(1, ...vendasUltimos7Dias.map((d) => d.total));

  return (
    <div className="fade-in space-y-6">
      {/* Recibo — saldo em caixa */}
      <div className="receipt-edge rounded-2xl bg-[#241a12] px-5 pb-8 pt-6 text-[#f7f1e4] shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="mb-1 font-ledger text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f7f1e4]/70">
              Caixa Disponível
            </p>
            <h2 className="truncate font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {informacoesVisiveis ? formatCurrency(saldoCaixa) : 'R$ ••••••'}
            </h2>
          </div>
          <button
            onClick={alternarInformacoes}
            className="shrink-0 rounded-xl bg-[#f7f1e4]/10 p-2 text-[#f7f1e4] backdrop-blur-sm transition hover:bg-[#f7f1e4]/20"
            aria-label={informacoesVisiveis ? 'Ocultar informações' : 'Mostrar informações'}
            title={informacoesVisiveis ? 'Ocultar informações sensíveis' : 'Mostrar informações sensíveis'}
          >
            {informacoesVisiveis ? <Eye size={18} /> : <EyeSlash size={18} />}
          </button>
        </div>

        <div className="flex gap-3">
          <Link
            to="/entradas"
            title="Abrir entradas"
            className="min-w-0 flex-1 rounded-xl border border-[#f7f1e4]/15 bg-[#f7f1e4]/10 p-3 transition hover:bg-[#f7f1e4]/15"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="truncate font-ledger text-[9px] font-bold uppercase tracking-wide text-[#f7f1e4]/80">
                Entradas {sufixoPeriodo}
              </p>
              <span className="flex shrink-0 items-center text-[#7fd9ab]">
                <TrendUp size={16} weight="fill" />
                <CaretRight size={14} weight="bold" />
              </span>
            </div>
            <p className="truncate font-ledger text-lg font-semibold tabular-nums">
              {informacoesVisiveis ? formatCurrency(resumoPeriodo.vendas) : '••••'}
            </p>
          </Link>
          <Link
            to="/despesas"
            title="Abrir despesas"
            className="min-w-0 flex-1 rounded-xl border border-[#f7f1e4]/15 bg-[#f7f1e4]/10 p-3 transition hover:bg-[#f7f1e4]/15"
          >
            <div className="mb-1 flex items-start justify-between gap-2">
              <p className="truncate font-ledger text-[9px] font-bold uppercase tracking-wide text-[#f7f1e4]/80">
                Despesas {sufixoPeriodo}
              </p>
              <span className="flex shrink-0 items-center text-[#f0a89f]">
                <TrendDown size={16} weight="fill" />
                <CaretRight size={14} weight="bold" />
              </span>
            </div>
            <p className="truncate font-ledger text-lg font-semibold tabular-nums">
              {informacoesVisiveis ? formatCurrency(resumoPeriodo.despesas) : '••••'}
            </p>
          </Link>
        </div>
      </div>

      {/* Ações rápidas */}
      <div
        id="dashboard-action-buttons"
        className="grid grid-cols-3 gap-2 rounded-2xl border border-line bg-paper-raised p-3 shadow-sm"
      >
        <QuickAction icon={Calculator} label="Caixa" tone="caixa" to="/caixa" />
        <QuickAction
          icon={ArrowUpRight}
          label="Entradas"
          tone="entrada"
          disabled={!data.caixaAtual}
          onClick={() => {
            setLancamentoTipo('entrada');
            setLancamentoTipoEntrada(tipoEntradaPadrao);
            setLancamentoErro(null);
            setLancamentoModalAberto(true);
          }}
        />
        <QuickAction
          icon={ArrowDownRight}
          label="Despesa"
          tone="saida"
          disabled={!data.caixaAtual}
          onClick={() => {
            setLancamentoTipo('saida');
            setLancamentoCategoria('');
            setLancamentoErro(null);
            setLancamentoModalAberto(true);
          }}
        />
      </div>

      <Modal
        open={lancamentoModalAberto}
        onClose={() => setLancamentoModalAberto(false)}
      >
        <div className="mb-5 flex items-center gap-3 pr-10">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
              lancamentoTipo === 'entrada' ? 'bg-ledger/15 text-ledger-strong' : 'bg-stamp/15 text-stamp'
            }`}
          >
            {lancamentoTipo === 'entrada' ? <ArrowUp size={24} /> : <ArrowDown size={24} />}
          </div>
          <div>
            <h2 className="font-display text-xl font-bold">{lancamentoTipo === 'entrada' ? 'Nova Entrada' : 'Nova Despesa'}</h2>
            <p className="text-xs text-ink-soft">
              {lancamentoTipo === 'entrada' ? 'Registre um recebimento' : 'Registre uma despesa'}
            </p>
          </div>
        </div>

        <div
          data-selected={lancamentoTipo}
          data-choice-position={lancamentoTipo === 'saida' ? 'second' : 'first'}
          className="segmented-slider segmented-slider-2 entry-exit-selector mb-6 grid grid-cols-2 rounded-xl border border-line bg-line/40 p-1"
        >
          <button
            type="button"
            aria-pressed={lancamentoTipo === 'entrada'}
            onClick={() => {
              setLancamentoTipo('entrada');
            }}
            className={`selection-option flex items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold ${
              lancamentoTipo === 'entrada'
                ? 'bg-paper-raised text-ledger-strong shadow-sm dark:text-ledger'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <ArrowUpRight size={17} /> Entrada
          </button>
          <button
            type="button"
            aria-pressed={lancamentoTipo === 'saida'}
            onClick={() => {
              setLancamentoTipo('saida');
            }}
            className={`selection-option flex items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold ${
              lancamentoTipo === 'saida'
                ? 'bg-paper-raised text-stamp shadow-sm'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <ArrowDownRight size={17} /> Despesa
          </button>
        </div>

        <form className="space-y-5" onSubmit={handleSalvarLancamento}>
          <div>
            <label className="mb-2 block text-[10px] font-black uppercase text-ink-soft">Valor</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 font-ledger text-xl font-black text-ink-soft">
                R$
              </span>
              <input
                id="lancamento-valor"
                value={lancamentoValor}
                onChange={(e) => setLancamentoValor(sanitizeMoneyInput(e.target.value))}
                type="text"
                inputMode="decimal"
                pattern="[0-9]+([,][0-9]{1,2})?"
                required
                className="w-full rounded-2xl border border-line bg-paper py-4 pl-12 pr-4 font-ledger text-3xl font-black text-ink"
                placeholder="0,00"
              />
            </div>
          </div>

          {lancamentoTipo === 'entrada' && (
            <fieldset>
              <legend className="mb-2 block text-[10px] font-black uppercase text-ink-soft">Tipo de entrada</legend>
              <div className={`grid gap-2 ${opcoesTipoEntrada.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {opcoesTipoEntrada.map(({ valor: tipo, label }) => (
                  <button
                    key={tipo}
                    type="button"
                    aria-pressed={lancamentoTipoEntradaEfetivo === tipo}
                    data-tone={tipo}
                    onClick={() => setLancamentoTipoEntrada(tipo)}
                    className={`selection-option rounded-xl border px-2 py-3 text-xs font-semibold ${
                      lancamentoTipoEntradaEfetivo === tipo
                        ? 'border-ledger bg-ledger/10 text-ledger-strong ring-2 ring-ledger/15 dark:text-ledger'
                        : 'border-line bg-paper text-ink-soft hover:border-ink-soft hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {lancamentoTipoEntradaEfetivo === 'gorjeta' ? (
                <p className="mt-2 text-xs text-ledger-strong dark:text-ledger">Entrada direta, sem pendência de identificação.</p>
              ) : (
                <p className="mt-2 text-xs text-brass">Será marcada como pendente de identificação para o fechamento.</p>
              )}
            </fieldset>
          )}

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase text-ink-soft">Descrição</label>
            <input
              id="lancamento-descricao"
              value={lancamentoDescricao}
              onChange={(e) => setLancamentoDescricao(e.target.value)}
              type="text"
              required={lancamentoTipo === 'entrada' || !lancamentoCategoria}
              placeholder={
                lancamentoTipo === 'entrada'
                  ? lancamentoTipoEntradaEfetivo === 'servico'
                    ? 'Ex: Atendimento realizado'
                    : lancamentoTipoEntradaEfetivo === 'gorjeta'
                      ? 'Ex: Gorjeta recebida'
                      : 'Ex: Venda de produtos'
                  : 'Ex: Conta de luz ou fornecimento'
              }
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink"
            />
          </div>

          {lancamentoTipo === 'saida' && (
            <div>
              <label className="mb-2 block text-[10px] font-black uppercase text-ink-soft">Categoria de despesa</label>
              <select
                id="lancamento-categoria"
                value={lancamentoCategoria}
                onChange={(e) => setLancamentoCategoria(e.target.value as TipoDespesa | '')}
                className="w-full rounded-xl border border-line bg-paper px-4 py-3 text-ink"
              >
                <option value="">Selecione uma categoria</option>
                {TIPOS_DESPESA.map((tipo) => (
                  <option key={tipo.valor} value={tipo.valor}>{tipo.label}</option>
                ))}
              </select>
              {!lancamentoCategoria && (
                <p className="mt-2 text-xs text-brass">Sem categoria, a despesa ficará pendente para revisão no fechamento.</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-2 block text-[10px] font-black uppercase text-ink-soft">
              {lancamentoTipo === 'entrada' ? 'Forma de Recebimento' : 'Forma de Pagamento'}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {FORMAS_LANCAMENTO.map(({ value, label, Icon }) => {
                const selecionado = lancamentoPagamento === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={selecionado}
                    onClick={() => setLancamentoPagamento(value)}
                    className={`selection-option relative flex min-w-0 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-xs font-semibold ${
                      selecionado
                        ? 'border-ledger bg-ledger/10 text-ledger-strong ring-2 ring-ledger/15 dark:text-ledger'
                        : 'border-line bg-paper text-ink-soft hover:border-ink-soft hover:text-ink'
                    }`}
                  >
                    {selecionado && (
                      <CheckCircle
                        size={15}
                        weight="fill"
                        className="absolute right-1.5 top-1.5 text-ledger-strong dark:text-ledger"
                      />
                    )}
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        selecionado ? 'bg-ledger text-paper' : 'bg-line/50 text-ink-soft'
                      }`}
                    >
                      <Icon size={17} weight={selecionado ? 'fill' : 'regular'} />
                    </span>
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            id="btn-salvar-lancamento"
            type="submit"
            disabled={lancamentoSalvando}
            className={`w-full rounded-2xl py-4 font-bold text-paper transition active:scale-[0.98] disabled:cursor-wait disabled:opacity-60 ${
              lancamentoTipo === 'entrada' ? 'bg-ledger hover:bg-ledger-strong' : 'bg-stamp hover:bg-stamp/90'
            }`}
          >
            {lancamentoSalvando ? (
              'Salvando…'
            ) : lancamentoTipo === 'entrada' ? (
              <span className="inline-flex items-center justify-center gap-2">
                <ArrowUpRight size={18} /> Salvar Entrada
              </span>
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <ArrowDownRight size={18} /> Salvar Despesa
              </span>
            )}
          </button>
          {lancamentoErro && <p className="text-center text-sm font-medium text-stamp">{lancamentoErro}</p>}
        </form>
      </Modal>

      {/* Resumo em cartões */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          icon={Receipt}
          tone="stamp"
          label="A Pagar Hoje"
          value={informacoesVisiveis ? formatCurrency(totalAPagarHoje) : 'R$ ••••••'}
          caption={informacoesVisiveis ? contasAPagarHoje[0]?.descricao ?? 'Nenhuma conta hoje' : 'Informação oculta'}
        />
        <StatCard
          icon={HandCoins}
          tone="brass"
          label="A Receber"
          value={informacoesVisiveis ? formatCurrency(totalAReceber) : 'R$ ••••••'}
          caption={informacoesVisiveis ? `${clientesEmAberto} cliente(s) em aberto` : 'Informação oculta'}
        />
        <div className="col-span-2 flex min-w-0 flex-col justify-between gap-1 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm md:col-span-1">
          <div className="mb-1 flex items-center gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Lucro Estimado</span>
            <Info size={13} className="text-ink-soft" />
          </div>
          <p className="font-ledger text-lg font-semibold tabular-nums text-ledger-strong dark:text-ledger">
            {informacoesVisiveis ? formatCurrency(lucroEstimadoHoje) : 'R$ ••••••'}
          </p>
          <p className="text-[10px] text-ink-soft">
            {informacoesVisiveis ? 'Considera só itens com custo cadastrado.' : 'Informação oculta'}
          </p>
        </div>
        {metaDiaria > 0 && (
          <div className="col-span-2 flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm md:col-span-1">
            <div className="flex items-end justify-between gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">Meta Diária</span>
              <span className="font-ledger text-xs font-bold text-ledger-strong dark:text-ledger">
                {informacoesVisiveis ? `${progressoMeta}%` : '••%'}
              </span>
            </div>
            <div className="font-ledger text-sm font-semibold tabular-nums">
              {informacoesVisiveis ? formatCurrency(vendasHoje) : 'R$ ••••••'}{' '}
              <span className="font-normal text-ink-soft">
                / {informacoesVisiveis ? formatCurrency(metaDiaria) : 'R$ ••••••'}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-line">
              <div
                className="h-2 rounded-full bg-ledger transition-all duration-1000 ease-out"
                style={{ width: informacoesVisiveis ? `${progressoMeta}%` : '0%' }}
              />
            </div>
          </div>
        )}
      </div>

      {informacoesVisiveis &&
        (produtosEstoqueBaixo.length > 0 || contasVencendoEmBreve.length > 0 || contasVencidas.length > 0) && (
        <div>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-soft">Atenção Necessária</h2>
          <div className="space-y-3">
            {contasVencidasPagar.length > 0 && (
              <AlertRow
                tone="stamp"
                icon={WarningCircle}
                titulo="Contas Atrasadas"
                descricao={`${contasVencidasPagar.length} conta(s) vencida(s) — ${formatCurrency(
                  contasVencidasPagar.reduce((sum, c) => sum + c.valor, 0),
                )}`}
                acaoLabel="Ver"
                onAcao={() => navigate('/financas?tab=pagar')}
              />
            )}
            {contasVencidasReceber.length > 0 && (
              <AlertRow
                tone="stamp"
                icon={WarningCircle}
                titulo="Recebimentos Atrasados"
                descricao={`${contasVencidasReceber.length} fiado(s) vencido(s) — ${formatCurrency(
                  contasVencidasReceber.reduce((sum, c) => sum + c.valor, 0),
                )}`}
                acaoLabel="Ver"
                onAcao={() => navigate('/financas?tab=receber')}
              />
            )}
            {produtosEstoqueBaixo.length > 0 && controlaEstoque && (
              <AlertRow
                tone="brass"
                icon={Package}
                titulo="Estoque Baixo"
                descricao={`${produtosEstoqueBaixo.length} produto(s) precisam de reposição.`}
                acaoLabel="Ver"
                onAcao={() => navigate('/catalogo')}
              />
            )}
            {contasVencendoEmBreve.map((conta) => {
              const dias = Math.round(
                (new Date(`${conta.vencimento}T00:00:00`).getTime() - new Date(`${hoje}T00:00:00`).getTime()) /
                  86_400_000,
              );
              return (
                <AlertRow
                  key={conta.id}
                  tone="brass"
                  icon={ClockCountdown}
                  titulo={conta.descricao}
                  descricao={`Vence em ${dias} dia${dias > 1 ? 's' : ''} — ${formatCurrency(conta.valor)}`}
                  acaoLabel="Ver"
                  onAcao={() => navigate(conta.tipo === 'pagar' ? '/financas?tab=pagar' : '/financas?tab=receber')}
                />
              );
            })}
          </div>
        </div>
      )}

      {informacoesVisiveis && (
        <>
        <div className="grid gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <ChartBar size={16} className="text-ink-soft" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">Últimos 7 Dias</h2>
          </div>
          <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
            <div className="flex h-28 items-end justify-between gap-2">
              {vendasUltimos7Dias.map((dia) => {
                const altura = Math.max(4, Math.round((dia.total / maxHistorico) * 100));
                const isHoje = dia.data === hoje;
                return (
                  <div key={dia.data} className="flex flex-1 flex-col items-center gap-1">
                    <div className="flex h-20 w-full items-end">
                      <div
                        className={`w-full rounded-t-md transition-all ${isHoje ? 'bg-ledger' : 'bg-ledger/25'}`}
                        style={{ height: `${altura}%` }}
                        title={formatCurrency(dia.total)}
                      />
                    </div>
                    <span className="text-[9px] font-medium capitalize text-ink-soft">
                      {diaSemanaCurto.format(new Date(`${dia.data}T00:00:00`)).replace('.', '')}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {emAltaHoje.length > 0 && (
          <div className="min-w-0">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-soft">Em Alta Hoje</h2>
            <div className="scrollbar-hide flex gap-3 overflow-x-auto pb-2 lg:flex-wrap lg:overflow-visible">
              {emAltaHoje.map(([descricao, quantidade]) => (
                <div
                  key={descricao}
                  className="flex min-w-[110px] flex-1 flex-col items-center rounded-xl border border-line bg-paper-raised p-3 text-center shadow-sm lg:w-[140px] lg:min-w-[140px] lg:flex-none"
                >
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-ledger/10 text-ledger-strong dark:text-ledger">
                    <Package size={20} />
                  </div>
                  <p className="w-full truncate text-xs font-medium text-ink">{descricao}</p>
                  <p className="mt-1 font-ledger text-[10px] font-medium text-ink-soft">{quantidade} un vendidas</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

        <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-ink-soft">Movimentações recentes</h2>
          <Link to="/movimentacoes" className="inline-flex items-center gap-1 text-xs font-medium text-ledger-strong dark:text-ledger">
            Ver todas <CaretRight size={13} weight="bold" />
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
          {movimentacoesRecentes.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-8 text-center">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-line/50 text-ink-soft">
                <Newspaper size={20} />
              </div>
              <p className="mb-1 text-sm font-medium text-ink">Nenhuma movimentação registrada</p>
              <p className="mb-3 text-xs text-ink-soft">Entradas recebidas e despesas pagas aparecem aqui.</p>
              <button onClick={() => navigate('/caixa')} className="text-xs font-medium text-ledger-strong dark:text-ledger">
                Registrar uma entrada
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {movimentacoesRecentes.map((mov) => {
                const isSaida = mov.tipo === 'saida';
                return (
                  <li key={`${mov.origem}-${mov.id}`} className="flex items-center justify-between gap-3 p-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-line/40">
                        {isSaida ? (
                          <ArrowDown size={18} className="text-stamp" />
                        ) : (
                          <ArrowUp size={18} className="text-ledger-strong dark:text-ledger" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{mov.descricao}</div>
                        <div className="text-[10px] text-ink-soft">{mov.data.split('-').reverse().join('/')}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div
                        className={`font-ledger text-sm font-bold tabular-nums ${
                          isSaida ? 'text-stamp' : 'text-ledger-strong dark:text-ledger'
                        }`}
                      >
                        {isSaida ? '-' : '+'} {formatCurrency(mov.valor)}
                      </div>
                      {mov.origem !== 'conta' && (
                        <>
                          <button
                            onClick={() => {
                              if (mov.origem === 'venda') {
                                const venda = data.vendas.find((v) => v.id === mov.id);
                                if (venda) setVendaEditando(venda);
                              } else {
                                const lanc = data.lancamentosManuais.find((l) => l.id === mov.id);
                                if (lanc) setLancamentoEditando(lanc);
                              }
                            }}
                            aria-label="Editar"
                            title="Editar movimentação"
                            className="rounded p-1.5 text-ink-soft transition hover:bg-line/40 hover:text-ink"
                          >
                            <PencilSimple size={14} />
                          </button>
                          <button
                            onClick={() =>
                              setItemParaExcluir({
                                tipo: mov.origem === 'venda' ? 'venda' : 'lancamento',
                                id: mov.id,
                                label: mov.descricao,
                              })
                            }
                            aria-label="Excluir"
                            title="Excluir movimentação"
                            className="rounded p-1.5 text-ink-soft transition hover:bg-stamp/10 hover:text-stamp"
                          >
                            <Trash size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        </div>
        </>
      )}

      <Modal open={vendaEditando !== null} onClose={() => setVendaEditando(null)} title="Editar Venda">
        {vendaEditando && (
          <form className="space-y-4" onSubmit={handleEditarVendaSubmit} key={vendaEditando.id}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Descrição</label>
              <input
                name="descricao"
                type="text"
                required
                defaultValue={vendaEditando.descricao}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Quantidade</label>
                <input
                  name="quantidade"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]+"
                  onInput={(e) => {
                    e.currentTarget.value = sanitizeIntegerInput(e.currentTarget.value);
                  }}
                  required
                  defaultValue={vendaEditando.quantidade}
                  className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Valor Unitário</label>
                <input
                  name="valorUnitario"
                  type="text"
                  inputMode="decimal"
                  onInput={(e) => {
                    e.currentTarget.value = sanitizeMoneyInput(e.currentTarget.value);
                  }}
                  required
                  defaultValue={vendaEditando.valorUnitario.toString().replace('.', ',')}
                  className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Data</label>
              <input
                name="data"
                type="date"
                required
                defaultValue={vendaEditando.data}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Forma de Pagamento</label>
              <select
                name="formaPagamento"
                defaultValue={vendaEditando.formaPagamento}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="cartao_credito">Cartão Crédito</option>
                <option value="cartao_debito">Cartão Débito</option>
                <option value="fiado">Fiado</option>
              </select>
              {vendaEditando.formaPagamento === 'fiado' && (
                <p className="mt-2 text-xs text-ink-soft">
                  Trocar para outra forma remove a conta a receber gerada por esta venda, se ela ainda não tiver sido paga.
                </p>
              )}
            </div>
            <button type="submit" className="mt-2 w-full rounded-lg bg-ledger py-2.5 font-bold text-paper transition hover:bg-ledger-strong">
              Salvar Alterações
            </button>
          </form>
        )}
      </Modal>

      <Modal open={lancamentoEditando !== null} onClose={() => setLancamentoEditando(null)} title="Editar Lançamento">
        {lancamentoEditando && (
          <form className="space-y-4" onSubmit={handleEditarLancamentoSubmit} key={lancamentoEditando.id}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Descrição</label>
              <input
                name="descricao"
                type="text"
                required
                defaultValue={lancamentoEditando.descricao}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Valor</label>
              <input
                name="valor"
                type="text"
                inputMode="decimal"
                onInput={(e) => {
                  e.currentTarget.value = sanitizeMoneyInput(e.currentTarget.value);
                }}
                required
                defaultValue={lancamentoEditando.valor.toString().replace('.', ',')}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Data</label>
              <input
                name="data"
                type="date"
                required
                defaultValue={lancamentoEditando.data}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <button type="submit" className="mt-2 w-full rounded-lg bg-ledger py-2.5 font-bold text-paper transition hover:bg-ledger-strong">
              Salvar Alterações
            </button>
          </form>
        )}
      </Modal>

      <Modal open={itemParaExcluir !== null} onClose={() => setItemParaExcluir(null)} title="Confirmar exclusão">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem certeza que deseja excluir <span className="font-semibold text-ink">{itemParaExcluir?.label}</span>? Esta
            ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setItemParaExcluir(null)}
              className="flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-line/30"
            >
              Cancelar
            </button>
            <button
              onClick={confirmarExclusao}
              className="flex-1 rounded-lg bg-stamp px-4 py-2 text-sm font-semibold text-paper transition hover:bg-stamp/90"
            >
              Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({
  icon: Icon,
  tone,
  label,
  value,
  caption,
}: {
  icon: typeof Receipt;
  tone: 'stamp' | 'brass';
  label: string;
  value: string;
  caption: string;
}) {
  const toneClasses = tone === 'stamp' ? 'bg-stamp/10 text-stamp' : 'bg-brass/10 text-brass';
  return (
    <div className="flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-line bg-paper-raised p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-2 text-ink-soft">
        <div className={`shrink-0 rounded-lg p-1.5 ${toneClasses}`}>
          <Icon size={16} />
        </div>
        <span className="min-w-0 truncate text-[10px] font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className={`font-ledger text-lg font-semibold tabular-nums ${tone === 'stamp' ? 'text-stamp' : 'text-ink'}`}>
        {value}
      </div>
      <div className="truncate text-[10px] text-ink-soft">{caption}</div>
    </div>
  );
}

function AlertRow({
  tone,
  icon: Icon,
  titulo,
  descricao,
  acaoLabel,
  onAcao,
}: {
  tone: 'stamp' | 'brass';
  icon: typeof WarningCircle;
  titulo: string;
  descricao: string;
  acaoLabel: string;
  onAcao: () => void;
}) {
  const toneClasses =
    tone === 'stamp'
      ? 'border-stamp/30 bg-stamp/10 text-stamp'
      : 'border-brass/30 bg-brass/10 text-brass';
  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${toneClasses}`}>
      <div className="shrink-0 rounded-lg bg-paper-raised/60 p-2">
        <Icon size={20} weight="fill" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink">{titulo}</p>
        <p className="truncate text-xs">{descricao}</p>
      </div>
      <button onClick={onAcao} title={`${acaoLabel}: ${titulo}`} className="shrink-0 text-sm font-medium">
        {acaoLabel}
      </button>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  to,
  onClick,
  disabled,
  badge,
  tone = 'neutro',
}: {
  icon: typeof Calculator;
  label: string;
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: string;
  tone?: 'caixa' | 'entrada' | 'saida' | 'neutro';
}) {
  const toneClasses = {
    caixa: {
      icon: 'bg-sky-500/15 text-sky-700 group-hover:bg-white group-hover:text-sky-700 dark:bg-sky-400/15 dark:text-sky-300 dark:group-hover:bg-white dark:group-hover:text-sky-600',
      action: 'text-sky-700 hover:bg-sky-700 hover:text-white dark:text-sky-300 dark:hover:bg-sky-600 dark:hover:text-white',
    },
    entrada: {
      icon: 'bg-ledger/15 text-ledger-strong group-hover:bg-white group-hover:text-ledger-strong dark:text-ledger dark:group-hover:bg-white dark:group-hover:text-ledger-strong',
      action: 'text-ledger-strong hover:bg-ledger-strong hover:text-white dark:text-ledger dark:hover:bg-ledger-strong dark:hover:text-white',
    },
    saida: {
      icon: 'bg-stamp/15 text-stamp group-hover:bg-white group-hover:text-stamp dark:group-hover:bg-white dark:group-hover:text-[#a9433a]',
      action: 'text-stamp hover:bg-stamp hover:text-white dark:hover:bg-[#a9433a] dark:hover:text-white',
    },
    neutro: {
      icon: 'bg-line/30 text-ink-soft/60',
      action: 'cursor-default text-ink-soft/50',
    },
  }[tone];

  const content = (
    <>
      <div
        className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${disabled ? 'bg-line/30 text-ink-soft/60' : toneClasses.icon}`}
      >
        <Icon size={18} />
      </div>
      <span className="text-[10px] font-medium">{label}</span>
      {badge && (
        <span className="absolute bottom-1.5 rounded-full bg-brass/10 px-1.5 py-0.5 font-ledger text-[8px] font-bold uppercase tracking-wide text-brass">
          {badge}
        </span>
      )}
    </>
  );

  const className = `group relative flex min-h-[86px] w-full flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition-colors ${
    disabled ? 'cursor-default text-ink-soft/50' : toneClasses.action
  }`;

  return to ? (
    <Link to={to} className={className} title={label} aria-label={label}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
      title={badge ? `${label}: ${badge}` : label}
      aria-label={badge ? `${label}: ${badge}` : label}
    >
      {content}
    </button>
  );
}
