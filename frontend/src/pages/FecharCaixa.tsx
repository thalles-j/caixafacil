import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CaretDown,
  CheckCircle,
  CreditCard,
  ListBullets,
  LockKey,
  Money,
  Plus,
  QrCode,
  Receipt,
  WarningCircle,
} from '@phosphor-icons/react';
import PendingIdentificationList from '../components/PendingIdentificationList';
import Pagination from '../components/Pagination';
import { useAppData } from '../context/AppDataContext';
import { formatCurrency, parseMoney, sanitizeMoneyInput, todayISO } from '../lib/format';
import { obterMovimentacoesFinanceiras, obterVendas } from '../lib/movements';
import { TIPOS_DESPESA } from '../types';
import type { FormaPagamento, TipoDespesa, TipoEntrada } from '../types';
import type { Movimentacao } from '../lib/movements';
import { paginateItems } from '../lib/pagination';
import { defaultEntryType, entryTypeOptionsForOffer } from '../lib/offering';

type FormaLancamento = Exclude<FormaPagamento, 'fiado' | 'cartao_debito'>;
type EtapaFechamento = 'conferencia' | 'pendencias' | 'confirmacao';

const FORMAS: ReadonlyArray<{ valor: FormaLancamento; label: string; Icon: typeof Money }> = [
  { valor: 'dinheiro', label: 'Dinheiro', Icon: Money },
  { valor: 'pix', label: 'Pix', Icon: QrCode },
  { valor: 'cartao_credito', label: 'Cartão', Icon: CreditCard },
];

const horario = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function FecharCaixa() {
  const navigate = useNavigate();
  const { data, registrarLancamentoNoBanco, fecharCaixa } = useAppData();
  const caixa = data.caixaAtual;
  const oferta = data.config?.oferta ?? 'ambos';
  const opcoesTipoEntrada = entryTypeOptionsForOffer(oferta);
  const tipoEntradaPadrao = defaultEntryType(oferta);

  const [tipoLancamento, setTipoLancamento] = useState<'entrada' | 'saida'>('entrada');
  const [valorLancamento, setValorLancamento] = useState('');
  const [descricaoLancamento, setDescricaoLancamento] = useState('');
  const [tipoEntrada, setTipoEntrada] = useState<TipoEntrada>(tipoEntradaPadrao);
  const [tipoDespesa, setTipoDespesa] = useState<TipoDespesa | ''>('');
  const [formaPagamento, setFormaPagamento] = useState<FormaLancamento>('dinheiro');
  const [salvandoLancamento, setSalvandoLancamento] = useState(false);
  const [erroLancamento, setErroLancamento] = useState<string | null>(null);
  const [miniCaixaAberto, setMiniCaixaAberto] = useState(false);

  const [dinheiroContado, setDinheiroContado] = useState('');
  const [etapa, setEtapa] = useState<EtapaFechamento>('conferencia');
  const [fechando, setFechando] = useState(false);
  const [erroFechamento, setErroFechamento] = useState<string | null>(null);
  const tipoEntradaEfetivo = opcoesTipoEntrada.some((opcao) => opcao.valor === tipoEntrada)
    ? tipoEntrada
    : tipoEntradaPadrao;

  const hoje = todayISO();
  const pendencias = useMemo(
    () =>
      caixa
        ? data.lancamentosManuais.filter(
            (lancamento) => lancamento.identificacaoPendente && lancamento.caixaSessaoId === caixa.id,
          )
        : [],
    [caixa, data.lancamentosManuais],
  );
  const quantidadePendencias = Math.max(caixa?.pendenciasIdentificacao ?? 0, pendencias.length);
  const temPendencias = quantidadePendencias > 0;

  const movimentacoesHoje = useMemo(() => {
    const efetivadas = obterMovimentacoesFinanceiras(data).filter((movimento) => movimento.data === hoje);
    const vendasFiado = obterVendas(data).filter(
      (movimento) => movimento.data === hoje && movimento.formaPagamento === 'fiado',
    );
    return [...efetivadas, ...vendasFiado].sort(
      (a, b) => b.ocorridoEm.localeCompare(a.ocorridoEm) || b.ordem - a.ordem,
    );
  }, [data, hoje]);

  const totaisDia = useMemo(
    () => ({
      entradas: movimentacoesHoje
        .filter((movimento) => movimento.tipo === 'entrada' && movimento.formaPagamento !== 'fiado')
        .reduce((total, movimento) => total + movimento.valor, 0),
      saidas: movimentacoesHoje
        .filter((movimento) => movimento.tipo === 'saida')
        .reduce((total, movimento) => total + movimento.valor, 0),
      fiado: movimentacoesHoje
        .filter((movimento) => movimento.formaPagamento === 'fiado')
        .reduce((total, movimento) => total + movimento.valor, 0),
    }),
    [movimentacoesHoje],
  );

  if (!caixa) return <Navigate to="/caixa" replace />;

  const contado = dinheiroContado.trim() ? parseMoney(dinheiroContado) : 0;
  const contadoValido = dinheiroContado.trim() !== '' && Number.isFinite(contado) && contado >= 0;
  const diferenca = contado - caixa.dinheiroEsperado;

  const salvarLancamento = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const valor = parseMoney(valorLancamento);
    const categoriaLabel = TIPOS_DESPESA.find((tipo) => tipo.valor === tipoDespesa)?.label ?? '';
    const descricao = descricaoLancamento.trim() || (tipoLancamento === 'saida' ? categoriaLabel : '');
    if (!Number.isFinite(valor) || valor <= 0 || !descricao) {
      setErroLancamento('Informe uma descrição e um valor maior que zero.');
      return;
    }

    setSalvandoLancamento(true);
    setErroLancamento(null);
    try {
      await registrarLancamentoNoBanco({
        tipo: tipoLancamento,
        descricao,
        valor,
        formaPagamento,
        tipoEntrada: tipoLancamento === 'entrada' ? tipoEntradaEfetivo : undefined,
        tipoDespesa: tipoLancamento === 'saida' ? tipoDespesa || undefined : undefined,
        movimentoCaixa: 'regular',
      });
      setValorLancamento('');
      setDescricaoLancamento('');
      setTipoDespesa('');
      setTipoEntrada(tipoEntradaPadrao);
      setEtapa('conferencia');
      setMiniCaixaAberto(false);
    } catch (error) {
      setErroLancamento(error instanceof Error ? error.message : 'Não foi possível salvar o lançamento.');
    } finally {
      setSalvandoLancamento(false);
    }
  };

  const iniciarFechamento = () => {
    if (!contadoValido) return;
    setErroFechamento(null);
    setEtapa(temPendencias ? 'pendencias' : 'confirmacao');
  };

  const confirmarFechamento = async () => {
    if (!contadoValido) return;
    setFechando(true);
    setErroFechamento(null);
    try {
      await fecharCaixa(contado, temPendencias);
      navigate('/fechamentos', { replace: true });
    } catch (error) {
      setErroFechamento(error instanceof Error ? error.message : 'Não foi possível fechar o caixa.');
      setEtapa('conferencia');
    } finally {
      setFechando(false);
    }
  };

  return (
    <div className="fade-in space-y-4 sm:space-y-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <Link to="/caixa" className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
            <ArrowLeft size={14} /> Voltar para a frente de caixa
          </Link>
          <h2 className="font-display text-2xl font-bold text-ink">Fechamento de Caixa</h2>
          <p className="mt-1 text-sm text-ink-soft">Revise o movimento do dia, resolva pendências e confira o dinheiro físico.</p>
        </div>
        <div className="w-full rounded-xl border border-ledger/20 bg-ledger/5 px-4 py-2 text-sm sm:w-auto">
          <p className="font-semibold text-ledger-strong dark:text-ledger">Caixa aberto</p>
          <p className="font-ledger text-xs text-ink-soft">Inicial: {formatCurrency(caixa.valorInicial)}</p>
        </div>
      </header>

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <section className="order-1 min-w-0 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-lg font-bold text-ink">Pendências do caixa</h3>
                <p className="mt-1 text-xs text-ink-soft">Confirme o tipo de cada lançamento que ficou sem identificação.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 font-ledger text-xs font-bold ${temPendencias ? 'bg-brass/15 text-brass' : 'bg-ledger/10 text-ledger-strong dark:text-ledger'}`}>
                {quantidadePendencias}
              </span>
            </div>

            {pendencias.length > 0 ? (
              <PendingIdentificationList lancamentos={pendencias} />
            ) : temPendencias ? (
              <p className="rounded-xl border border-line bg-paper p-3 text-sm text-ink-soft">Atualizando os detalhes das pendências…</p>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-ledger/10 p-3 text-sm text-ledger-strong dark:text-ledger">
                <CheckCircle size={19} weight="fill" /> Nenhuma pendência neste caixa.
              </div>
            )}
          </section>

          <section className="order-2 min-w-0 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
            <button
              type="button"
              onClick={() => setMiniCaixaAberto((aberto) => !aberto)}
              aria-expanded={miniCaixaAberto}
              aria-controls="formulario-mini-caixa"
              className={`mini-cash-toggle flex w-full items-center justify-between gap-3 rounded-xl border border-transparent px-2 py-2 text-left text-ink hover:text-ledger-strong dark:hover:text-ledger ${
                miniCaixaAberto ? 'open' : ''
              }`}
            >
              <span className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ledger/10 text-ledger-strong dark:text-ledger">
                  <Plus
                    size={20}
                    weight="bold"
                    className={`transition-transform duration-300 ${miniCaixaAberto ? 'rotate-45' : ''}`}
                  />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold">
                    {miniCaixaAberto ? 'Fechar mini caixa' : 'Abrir mini caixa'}
                  </span>
                  <span className="mt-0.5 block text-xs font-normal text-ink-soft">
                    Adicione uma entrada ou despesa esquecida.
                  </span>
                </span>
              </span>
              <CaretDown
                size={19}
                className={`shrink-0 text-ink-soft transition-transform duration-300 ${miniCaixaAberto ? 'rotate-180' : ''}`}
              />
            </button>

            <div
              id="formulario-mini-caixa"
              aria-hidden={!miniCaixaAberto}
              inert={!miniCaixaAberto}
              className={`collapsible-panel ${miniCaixaAberto ? 'open' : ''}`}
            >
              <div>
            <form className="min-w-0 space-y-4 pt-4" onSubmit={salvarLancamento}>
              <div
                data-selected={tipoLancamento}
                data-choice-position={tipoLancamento === 'saida' ? 'second' : 'first'}
                className="segmented-slider segmented-slider-2 entry-exit-selector grid grid-cols-2 rounded-xl border border-line bg-line/40 p-1"
              >
                {(['entrada', 'saida'] as const).map((tipo) => (
                  <button
                    key={tipo}
                    type="button"
                    aria-pressed={tipoLancamento === tipo}
                    onClick={() => {
                      setTipoLancamento(tipo);
                      setErroLancamento(null);
                    }}
                    className={`selection-option flex items-center justify-center gap-1.5 rounded-lg border-0 px-3 py-2 text-sm font-semibold ${
                      tipoLancamento === tipo
                        ? tipo === 'entrada'
                          ? 'bg-paper-raised text-ledger-strong shadow-sm dark:text-ledger'
                          : 'bg-paper-raised text-stamp shadow-sm'
                        : 'text-ink-soft'
                    }`}
                  >
                    {tipo === 'entrada' ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
                    {tipo === 'entrada' ? 'Entrada' : 'Despesa'}
                  </button>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Valor</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-ledger text-sm font-bold text-ink-soft">R$</span>
                    <input
                      value={valorLancamento}
                      onChange={(event) => setValorLancamento(sanitizeMoneyInput(event.target.value))}
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      required
                      className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-3 font-ledger text-lg font-bold text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                    />
                  </div>
                </label>
                <label>
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Descrição</span>
                  <input
                    value={descricaoLancamento}
                    onChange={(event) => setDescricaoLancamento(event.target.value)}
                    type="text"
                    placeholder={
                      tipoLancamento === 'entrada'
                        ? tipoEntradaEfetivo === 'servico'
                          ? 'Ex: Atendimento realizado'
                          : tipoEntradaEfetivo === 'gorjeta'
                            ? 'Ex: Gorjeta recebida'
                            : 'Ex: Venda rápida'
                        : 'Ex: Compra emergencial'
                    }
                    required={tipoLancamento === 'entrada' || !tipoDespesa}
                    className="w-full rounded-xl border border-line bg-paper px-3 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                  />
                </label>
              </div>

              {tipoLancamento === 'entrada' ? (
                <fieldset>
                  <legend className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Tipo da entrada</legend>
                  <div className={`grid gap-2 ${opcoesTipoEntrada.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                    {opcoesTipoEntrada.map((tipo) => (
                      <button
                        key={tipo.valor}
                        type="button"
                        aria-pressed={tipoEntradaEfetivo === tipo.valor}
                        data-tone={tipo.valor}
                        onClick={() => setTipoEntrada(tipo.valor)}
                        className={`selection-option rounded-lg border px-2 py-2 text-xs font-semibold ${tipoEntradaEfetivo === tipo.valor ? 'border-ledger bg-ledger/10 text-ledger-strong dark:text-ledger' : 'border-line text-ink-soft'}`}
                      >
                        {tipo.label}
                      </button>
                    ))}
                  </div>
                  <p className={`mt-2 text-xs ${tipoEntradaEfetivo === 'gorjeta' ? 'text-ledger-strong dark:text-ledger' : 'text-brass'}`}>
                    {tipoEntradaEfetivo === 'gorjeta'
                      ? 'Gorjeta entra sem pendência.'
                      : `${tipoEntradaEfetivo === 'produto' ? 'Produto' : 'Serviço'} ficará pendente até a confirmação.`}
                  </p>
                </fieldset>
              ) : (
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Categoria da despesa</span>
                  <select
                    value={tipoDespesa}
                    onChange={(event) => setTipoDespesa(event.target.value as TipoDespesa | '')}
                    className="w-full rounded-xl border border-line bg-paper px-3 py-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                  >
                    <option value="">Deixar pendente para identificar depois</option>
                    {TIPOS_DESPESA.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{tipo.label}</option>)}
                  </select>
                </label>
              )}

              <fieldset>
                <legend className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                  {tipoLancamento === 'entrada' ? 'Recebimento' : 'Pagamento'}
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {FORMAS.map(({ valor, label, Icon }) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={formaPagamento === valor}
                      onClick={() => setFormaPagamento(valor)}
                      className={`selection-option flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold ${formaPagamento === valor ? 'border-ledger bg-ledger/10 text-ledger-strong dark:text-ledger' : 'border-line text-ink-soft'}`}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {erroLancamento && <p className="text-xs font-medium text-stamp">{erroLancamento}</p>}
              <button
                type="submit"
                disabled={salvandoLancamento}
                className={`w-full rounded-xl py-3 text-sm font-bold text-paper disabled:opacity-50 ${tipoLancamento === 'entrada' ? 'bg-ledger' : 'bg-stamp'}`}
              >
                {salvandoLancamento ? 'Salvando…' : `Adicionar ${tipoLancamento === 'entrada' ? 'entrada' : 'despesa'}`}
              </button>
            </form>
              </div>
            </div>
          </section>

          <section className="order-4 min-w-0 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5 lg:order-3">
            <div className="mb-4 flex items-center gap-2">
              <Receipt size={20} className="text-ink-soft" />
              <h3 className="font-display text-lg font-bold text-ink">Conferência final</h3>
            </div>
            <div className="space-y-2 rounded-xl bg-paper p-4 text-sm">
              <ResumoLinha label="Valor inicial" valor={caixa.valorInicial} destaque />
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Entradas / vendas</p>
              <ResumoLinha label="Dinheiro" valor={caixa.vendasDinheiro} recuo />
              <ResumoLinha label="Pix" valor={caixa.vendasPix} recuo />
              <ResumoLinha label="Cartão" valor={caixa.vendasCartao} recuo />
              <ResumoLinha label="Fiado" valor={caixa.vendasFiado} recuo />
              <p className="pt-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Saídas</p>
              <ResumoLinha label="Sangrias / despesas em dinheiro" valor={caixa.sangrias} recuo />
              {caixa.saidasOutros > 0 && <ResumoLinha label="Despesas por outros meios" valor={caixa.saidasOutros} recuo />}
              <div className="my-2 border-t border-dashed border-line" />
              <ResumoLinha label="Dinheiro esperado" valor={caixa.dinheiroEsperado} destaque />
            </div>

            <label className="mt-4 block">
              <span className="mb-1 block text-xs font-semibold text-ink">Dinheiro contado</span>
              <input
                value={dinheiroContado}
                onChange={(event) => {
                  setDinheiroContado(sanitizeMoneyInput(event.target.value));
                  setEtapa('conferencia');
                }}
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                className="w-full rounded-xl border border-line bg-paper px-4 py-3 font-ledger text-2xl font-bold text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </label>

            {contadoValido && (
              <div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${diferenca < 0 ? 'bg-stamp/10 text-stamp' : diferenca > 0 ? 'bg-brass/10 text-brass' : 'bg-ledger/10 text-ledger-strong dark:text-ledger'}`}>
                <div className="flex items-center justify-between gap-3">
                  <span>Diferença</span>
                  <span className="font-ledger text-base">{formatCurrency(diferenca)}</span>
                </div>
                <p className="mt-1 text-xs">
                  {diferenca < 0
                    ? `Quebra de caixa: ${formatCurrency(Math.abs(diferenca))}`
                    : diferenca > 0
                      ? `Sobra de caixa: ${formatCurrency(diferenca)}`
                      : 'Caixa conferido ✓'}
                </p>
              </div>
            )}

            {etapa === 'pendencias' && (
              <div className="mt-4 rounded-xl border border-brass/30 bg-brass/10 p-4">
                <div className="flex items-start gap-2 text-brass">
                  <WarningCircle size={21} className="shrink-0" weight="fill" />
                  <div>
                    <p className="text-sm font-semibold">Existem {quantidadePendencias} lançamentos pendentes.</p>
                    <p className="mt-1 text-xs text-ink-soft">Você pode voltar para resolver ou fechar e identificar depois na página de Fechamentos.</p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 min-[400px]:flex-row">
                  <button type="button" onClick={() => setEtapa('conferencia')} className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink">Revisar</button>
                  <button type="button" onClick={() => setEtapa('confirmacao')} className="flex-1 rounded-lg bg-brass px-3 py-2 text-xs font-bold text-paper">Fechar mesmo assim</button>
                </div>
              </div>
            )}

            {etapa === 'confirmacao' && (
              <div className="mt-4 rounded-xl border border-stamp/30 bg-stamp/10 p-4">
                <div className="flex items-start gap-2">
                  <LockKey size={21} className="shrink-0 text-stamp" weight="fill" />
                  <div>
                    <p className="text-sm font-semibold text-stamp">Confirmar fechamento?</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      Revise o dinheiro contado. Se ainda encontrar um erro, somente este último fechamento poderá ser reaberto antes da abertura de outro caixa.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-2 min-[400px]:flex-row">
                  <button type="button" onClick={() => setEtapa(temPendencias ? 'pendencias' : 'conferencia')} className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-xs font-semibold text-ink">Voltar</button>
                  <button type="button" onClick={() => void confirmarFechamento()} disabled={fechando} className="flex-1 rounded-lg bg-stamp px-3 py-2 text-xs font-bold text-paper disabled:opacity-50">
                    {fechando ? 'Fechando…' : 'Confirmar fechamento'}
                  </button>
                </div>
              </div>
            )}

            {erroFechamento && <p className="mt-3 text-xs font-medium text-stamp">{erroFechamento}</p>}
            {etapa === 'conferencia' && (
              <button
                type="button"
                onClick={iniciarFechamento}
                disabled={!contadoValido}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-stamp px-4 py-3 font-bold text-paper disabled:opacity-45"
              >
                <LockKey size={18} /> Fechar Caixa
              </button>
            )}
          </section>
        </div>

        <MovimentosDoDia movimentacoes={movimentacoesHoje} totais={totaisDia} />
      </div>
    </div>
  );
}

function MovimentosDoDia({
  movimentacoes,
  totais,
}: {
  movimentacoes: Movimentacao[];
  totais: { entradas: number; saidas: number; fiado: number };
}) {
  const [pagina, setPagina] = useState(1);
  const movimentacoesPaginadas = paginateItems(movimentacoes, pagina);

  return (
    <aside className="order-3 min-w-0 rounded-2xl border border-line bg-paper-raised shadow-sm lg:order-none lg:sticky lg:top-20">
      <div className="border-b border-line p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-display text-lg font-bold text-ink"><ListBullets size={20} /> Movimentações de hoje</h3>
            <p className="mt-1 text-xs text-ink-soft">Todas as entradas e saídas, das mais recentes para as mais antigas.</p>
          </div>
          <span className="rounded-full bg-line/40 px-2.5 py-1 font-ledger text-xs font-bold text-ink-soft">{movimentacoes.length}</span>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <TotalDia label="Entradas" valor={totais.entradas} classe="text-ledger-strong dark:text-ledger" />
          <TotalDia label="Saídas" valor={totais.saidas} classe="text-stamp" />
          <TotalDia label="Fiado" valor={totais.fiado} classe="text-brass" />
        </div>
      </div>

      {movimentacoes.length === 0 ? (
        <div className="flex flex-col items-center px-5 py-14 text-center text-ink-soft">
          <Receipt size={32} className="mb-2 opacity-60" />
          <p className="text-sm font-medium text-ink">Nenhuma movimentação hoje.</p>
        </div>
      ) : (
        <>
        <ul className="divide-y divide-line lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto">
          {movimentacoesPaginadas.items.map((movimento, index) => {
            const fiado = movimento.formaPagamento === 'fiado';
            const entrada = movimento.tipo === 'entrada';
            const detalhe = movimento.origem === 'conta' && !entrada
              ? `Despesa paga hoje${movimento.formaPagamento ? ` · ${movimento.detalhe.split(' · ').at(-1)}` : ''}`
              : movimento.detalhe;
            const Icon = entrada ? ArrowUp : ArrowDown;
            return (
              <li key={`${movimento.origem}-${movimento.id}-${index}`} className="flex items-start gap-3 px-4 py-3.5 sm:px-5">
                <span className={`mt-0.5 rounded-lg p-1.5 ${fiado ? 'bg-brass/10 text-brass' : entrada ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'bg-stamp/10 text-stamp'}`}>
                  <Icon size={15} weight="bold" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{movimento.descricao}</p>
                  <p className="mt-0.5 truncate text-xs text-ink-soft">
                    {horario.format(new Date(movimento.ocorridoEm))} · {detalhe}
                  </p>
                </div>
                <span className={`shrink-0 font-ledger text-sm font-bold ${fiado ? 'text-brass' : entrada ? 'text-ledger-strong dark:text-ledger' : 'text-stamp'}`}>
                  {entrada ? '+ ' : '- '}{formatCurrency(movimento.valor)}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="px-3 pb-3">
          <Pagination
            currentPage={movimentacoesPaginadas.currentPage}
            totalItems={movimentacoes.length}
            onPageChange={setPagina}
            itemLabel="movimentações"
          />
        </div>
        </>
      )}
    </aside>
  );
}

function TotalDia({ label, valor, classe }: { label: string; valor: number; classe: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-paper p-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className={`mt-0.5 truncate font-ledger text-sm font-bold ${classe}`}>{formatCurrency(valor)}</p>
    </div>
  );
}

function ResumoLinha({ label, valor, destaque = false, recuo = false }: { label: string; valor: number; destaque?: boolean; recuo?: boolean }) {
  return (
    <div className={`flex items-start justify-between gap-3 ${destaque ? 'font-bold text-ink' : 'text-ink-soft'}`}>
      <span className={`min-w-0 text-sm leading-snug ${recuo ? 'pl-3' : ''}`}>{label}</span>
      <span className="shrink-0 font-ledger text-sm tabular-nums text-ink">{formatCurrency(valor)}</span>
    </div>
  );
}
