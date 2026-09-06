import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Lightning,
  House,
  Receipt,
  Users,
  HandCoins,
  WarningCircle,
  PencilSimple,
  Trash,
  Phone,
  ArrowsClockwise,
  CalendarBlank,
} from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import {
  formatCurrency,
  formatDate,
  formatDateInput,
  parseDateInput,
  parseMoney,
  sanitizeDateInput,
  sanitizeMoneyInput,
  todayISO,
} from '../lib/format';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import type { Cliente, Conta, FormaPagamento, LancamentoManual, TipoConta } from '../types';
import FinanceNav from '../components/FinanceNav';
import { getPagination, paginateItems } from '../lib/pagination';
import WhatsAppChargeButton from '../components/WhatsAppChargeButton';
import CustomerPrivacyActions from '../components/CustomerPrivacyActions';
import { useAuth } from '../context/AuthContext';

type ItemParaExcluir = { tipo: 'conta' | 'lancamento'; id: string; label: string };
type BaixaPendente = { tipo: 'fiado' | 'fixa'; id: string; nome: string; valor: number };

export default function Financas() {
  const { user } = useAuth();
  const {
    data,
    addConta,
    editarConta,
    removerConta,
    marcarContaQuitada,
    editarLancamentoManual,
    removerLancamentoManual,
    editarCliente,
    baixarFiado,
    baixarDespesaFixa,
  } = useAppData();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const aba: TipoConta = searchParams.get('tab') === 'receber' ? 'receber' : 'pagar';
  const [modalAberto, setModalAberto] = useState(false);
  const [contaEditando, setContaEditando] = useState<Conta | null>(null);
  const [lancamentoEditando, setLancamentoEditando] = useState<LancamentoManual | null>(null);
  const [itemParaExcluir, setItemParaExcluir] = useState<ItemParaExcluir | null>(null);
  const [baixaPendente, setBaixaPendente] = useState<BaixaPendente | null>(null);
  const [formaBaixa, setFormaBaixa] = useState<Exclude<FormaPagamento, 'fiado'>>('dinheiro');
  const [baixando, setBaixando] = useState(false);
  const [baixaErro, setBaixaErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [paginaClientes, setPaginaClientes] = useState(1);

  const mesAtual = todayISO().slice(0, 7);
  const gastosFixos = useMemo(() => data.config?.despesasFixas ?? [], [data.config?.despesasFixas]);

  const totalFixosMensal = useMemo(
    () => gastosFixos.reduce((total, gasto) => total + gasto.valor * (gasto.recorrencia === 'semanal' ? 4 : 1), 0),
    [gastosFixos],
  );

  const clientesPorId = useMemo(() => {
    const map = new Map<string, Cliente>();
    data.clientes.forEach((c) => map.set(c.id, c));
    return map;
  }, [data.clientes]);

  const contasDaAba = useMemo(
    () => data.contas.filter((c) => c.tipo === aba).sort((a, b) => a.vencimento.localeCompare(b.vencimento)),
    [data.contas, aba],
  );

  const lancamentosDaAba = useMemo(
    () =>
      data.lancamentosManuais
        .filter((l) => aba === 'pagar' && l.tipo === 'saida')
        .sort((a, b) => b.data.localeCompare(a.data)),
    [data.lancamentosManuais, aba],
  );

  const quantidadeFixosNaLista = aba === 'pagar' ? gastosFixos.length : 0;
  const totalItensNaLista = quantidadeFixosNaLista + contasDaAba.length + lancamentosDaAba.length;
  const paginacao = getPagination(totalItensNaLista, pagina);
  const gastosFixosPaginados =
    aba === 'pagar' ? gastosFixos.slice(paginacao.startIndex, paginacao.endIndex) : [];
  const inicioContas = Math.max(0, paginacao.startIndex - quantidadeFixosNaLista);
  const fimContas = Math.max(0, paginacao.endIndex - quantidadeFixosNaLista);
  const contasPaginadas = contasDaAba.slice(inicioContas, fimContas);
  const deslocamentoLancamentos = quantidadeFixosNaLista + contasDaAba.length;
  const inicioLancamentos = Math.max(0, paginacao.startIndex - deslocamentoLancamentos);
  const fimLancamentos = Math.max(0, paginacao.endIndex - deslocamentoLancamentos);
  const lancamentosPaginados = lancamentosDaAba.slice(inicioLancamentos, fimLancamentos);

  const totalMes = useMemo(
    () =>
      contasDaAba
        .filter((c) => c.vencimento.slice(0, 7) === mesAtual)
        .reduce((sum, c) => sum + c.valor, 0) +
      lancamentosDaAba
        .filter((lancamento) => lancamento.data.slice(0, 7) === mesAtual)
        .reduce((sum, lancamento) => sum + lancamento.valor, 0) +
      (aba === 'pagar' ? totalFixosMensal : 0),
    [aba, contasDaAba, lancamentosDaAba, mesAtual, totalFixosMensal],
  );

  const saldoPorCliente = useMemo(() => {
    if (aba !== 'receber') return [];
    const mapa = new Map<string, { id: string; nome: string; telefone?: string; total: number }>();
    data.contas
      .filter((c) => c.tipo === 'receber' && !c.quitado && c.clienteId)
      .forEach((c) => {
        const cliente = clientesPorId.get(c.clienteId!);
        const atual = mapa.get(c.clienteId!) ?? {
          id: c.clienteId!,
          nome: cliente?.nome ?? 'Cliente',
          telefone: cliente?.telefone,
          total: 0,
        };
        atual.total += c.valor;
        mapa.set(c.clienteId!, atual);
      });
    return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
  }, [aba, data.contas, clientesPorId]);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const descricao = String(form.get('descricao') ?? '').trim();
    const valor = parseMoney(String(form.get('valor') ?? '0'));
    const vencimento = String(form.get('vencimento') ?? todayISO());

    if (!descricao || valor <= 0) return;

    addConta({ tipo: 'pagar', descricao, valor, vencimento });
    setModalAberto(false);
  };

  const handleEditarContaSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!contaEditando) return;
    const form = new FormData(e.currentTarget);
    const descricao = String(form.get('descricao') ?? '').trim();
    const valor = parseMoney(String(form.get('valor') ?? '0'));
    const vencimentoInput = e.currentTarget.elements.namedItem('vencimento') as HTMLInputElement;
    const vencimento = parseDateInput(vencimentoInput.value);
    const clienteNome = String(form.get('clienteNome') ?? '').trim();
    const clienteTelefone = String(form.get('clienteTelefone') ?? '').trim();

    if (!vencimento) {
      vencimentoInput.setCustomValidity('Informe uma data válida no formato DD/MM/AAAA.');
      vencimentoInput.reportValidity();
      return;
    }

    if (!descricao || valor <= 0 || (contaEditando.clienteId && !clienteNome)) return;

    editarConta(contaEditando.id, { descricao, valor, vencimento });
    if (contaEditando.clienteId) {
      editarCliente(contaEditando.clienteId, {
        nome: clienteNome,
        telefone: clienteTelefone || undefined,
      });
    }
    setContaEditando(null);
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
    if (itemParaExcluir.tipo === 'conta') {
      removerConta(itemParaExcluir.id);
    } else {
      removerLancamentoManual(itemParaExcluir.id);
    }
    setItemParaExcluir(null);
  };

  const abrirConfirmacaoBaixa = (baixa: BaixaPendente) => {
    setBaixaPendente(baixa);
    setFormaBaixa('dinheiro');
    setBaixaErro(null);
  };

  const confirmarBaixa = async () => {
    if (!baixaPendente) return;
    setBaixando(true);
    setBaixaErro(null);
    try {
      if (baixaPendente.tipo === 'fiado') {
        await baixarFiado(baixaPendente.id, formaBaixa);
      } else {
        await baixarDespesaFixa(baixaPendente.id, formaBaixa);
      }
      setBaixaPendente(null);
    } catch (error) {
      setBaixaErro(error instanceof Error ? error.message : 'Não foi possível dar baixa.');
    } finally {
      setBaixando(false);
    }
  };

  const hoje = todayISO();
  const mostrarPainelClientes = aba === 'receber' && saldoPorCliente.length > 0;
  const clientesPaginados = paginateItems(saldoPorCliente, paginaClientes);

  const selecionarAba = (proximaAba: TipoConta) => {
    if (proximaAba === aba) return;
    setPagina(1);
    setPaginaClientes(1);
    setSearchParams({ tab: proximaAba }, { replace: true });
  };

  return (
    <div className="fade-in">
      <h2 className="font-display text-2xl font-bold text-ink">Financeiro</h2>
      <p className="mt-1 text-sm text-ink-soft">Suas principais contas aqui!</p>
      <FinanceNav />

      <div
        data-choice-position={aba === 'receber' ? 'second' : 'first'}
        className="segmented-slider segmented-slider-2 financial-tabs-selector mb-6 grid grid-cols-2 rounded-xl border border-line bg-line/40 p-1"
      >
        <button
          type="button"
          onClick={() => selecionarAba('pagar')}
          aria-pressed={aba === 'pagar'}
          className={`selection-option rounded-lg border-0 py-2 text-center text-sm font-medium ${
            aba === 'pagar' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-soft'
          }`}
        >
          A Pagar
        </button>
        <button
          type="button"
          onClick={() => selecionarAba('receber')}
          aria-pressed={aba === 'receber'}
          className={`selection-option rounded-lg border-0 py-2 text-center text-sm font-medium ${
            aba === 'receber' ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-soft'
          }`}
        >
          A Receber (Fiado)
        </button>
      </div>

      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-ink-soft">
            {aba === 'pagar' ? 'Total previsto' : 'Total a Receber'} (Mês)
          </p>
          <p className={`font-ledger text-2xl font-bold tabular-nums ${aba === 'pagar' ? 'text-stamp' : 'text-brass'}`}>
            {formatCurrency(totalMes)}
          </p>
        </div>
        {aba === 'pagar' ? (
          <button
            onClick={() => setModalAberto(true)}
            className="flex shrink-0 items-center gap-1 text-sm font-medium text-ledger-strong dark:text-ledger"
          >
            <Plus size={16} /> Despesa
          </button>
        ) : null}
      </div>

      <div className={mostrarPainelClientes ? 'lg:grid lg:grid-cols-3 lg:items-start lg:gap-6' : ''}>
        <div className={mostrarPainelClientes ? 'min-w-0 lg:col-span-2' : 'min-w-0'}>
          {aba === 'pagar' && gastosFixos.length > 0 && (
            <div className="mb-4 rounded-2xl border border-brass/25 bg-brass/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="mb-1 flex items-center gap-2 text-brass">
                    <ArrowsClockwise size={17} weight="bold" />
                    <h3 className="text-xs font-bold uppercase tracking-wide">Gastos fixos</h3>
                  </div>
                  <p className="text-xs text-ink-soft">
                    {gastosFixos.length} gasto(s) recorrente(s) · semanais calculados em 4 vezes no mês
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-ledger text-sm font-bold tabular-nums text-brass">{formatCurrency(totalFixosMensal)}</p>
                  <Link to="/configuracoes" className="text-[11px] font-medium text-brass hover:underline">
                    Gerenciar
                  </Link>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
            {contasDaAba.length === 0 && lancamentosDaAba.length === 0 && (aba !== 'pagar' || gastosFixos.length === 0) ? (
              <div className="flex flex-col items-center px-4 py-10 text-center">
                <div className={`mb-3 flex h-12 w-12 items-center justify-center rounded-full ${aba === 'pagar' ? 'bg-stamp/10 text-stamp' : 'bg-brass/10 text-brass'}`}>
                  {aba === 'pagar' ? <Receipt size={24} /> : <HandCoins size={24} />}
                </div>
                <p className="mb-1 text-sm font-medium text-ink">
                  {aba === 'pagar' ? 'Nenhuma conta a pagar cadastrada' : 'Nenhuma entrada registrada para hoje'}
                </p>
                <p className="mb-4 text-xs text-ink-soft">
                  {aba === 'pagar'
                    ? 'Cadastre uma despesa para acompanhar seus pagamentos.'
                    : 'As vendas fiado registradas no Caixa aparecem aqui.'}
                </p>
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  {aba === 'pagar' && (
                    <button
                      onClick={() => setModalAberto(true)}
                      className="flex items-center justify-center gap-1 rounded-lg bg-ledger px-4 py-2 text-sm font-medium text-paper"
                    >
                      <Plus size={16} /> Nova Despesa
                    </button>
                  )}
                  {aba === 'receber' && (
                    <button
                      onClick={() => navigate('/caixa')}
                      className="flex items-center justify-center gap-1 rounded-lg border border-ledger px-4 py-2 text-sm font-medium text-ledger-strong dark:text-ledger"
                    >
                      <HandCoins size={16} /> Ir para o Caixa
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {aba === 'pagar' &&
                  gastosFixosPaginados.map((gasto) => (
                    <li key={`fixo-${gasto.id}`} className="flex items-center justify-between gap-3 bg-brass/[0.03] p-4">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="shrink-0 rounded-lg bg-brass/10 p-2 text-brass">
                          <ArrowsClockwise size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink">{gasto.nome}</p>
                          <p className="mt-0.5 text-[11px] font-medium capitalize text-brass">
                            Gasto fixo · {gasto.recorrencia}
                          </p>
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-ledger font-bold tabular-nums text-ink">{formatCurrency(gasto.valor)}</p>
                        {gasto.quitado ? (
                          <span className="stamp mt-1 text-ledger-strong dark:text-ledger">Pago</span>
                        ) : (
                          <button
                            onClick={() => abrirConfirmacaoBaixa({ tipo: 'fixa', id: gasto.id, nome: gasto.nome, valor: gasto.valor })}
                            className="mt-1 rounded bg-ledger/10 px-2 py-1 text-xs font-medium text-ledger-strong dark:text-ledger"
                          >
                            Dar Baixa
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                {contasPaginadas.map((conta) => {
                  const venceHoje = conta.vencimento === hoje && !conta.quitado;
                  const atrasada = !conta.quitado && conta.vencimento < hoje;
                  const cliente = conta.clienteId ? clientesPorId.get(conta.clienteId) : undefined;
                  return (
                    <li
                      key={conta.id}
                      className={`flex items-center justify-between gap-3 p-4 ${conta.quitado ? 'opacity-60' : ''} ${
                        atrasada ? 'bg-stamp/5' : ''
                      }`}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div
                          className={`shrink-0 rounded-lg p-2 ${
                            conta.quitado
                              ? 'bg-line/40 text-ink-soft'
                              : atrasada
                              ? 'bg-stamp/15 text-stamp'
                              : 'bg-stamp/10 text-stamp'
                          }`}
                        >
                          {atrasada ? (
                            <WarningCircle size={20} weight="fill" />
                          ) : conta.origemVendaId ? (
                            <Receipt size={20} />
                          ) : conta.quitado ? (
                            <House size={20} />
                          ) : (
                            <Lightning size={20} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate font-medium text-ink ${conta.quitado ? 'line-through' : ''}`}>
                            {cliente?.nome ?? conta.descricao}
                          </p>
                          {cliente && <p className="truncate text-[11px] text-ink-soft">{conta.descricao}</p>}
                          {cliente?.telefone && (
                            <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-ink-soft">
                              <Phone size={11} className="shrink-0" /> {cliente.telefone}
                            </p>
                          )}
                          <div className="mt-1">
                            {conta.quitado ? (
                              <span className="stamp text-ledger-strong dark:text-ledger">
                                Pago {formatDate(conta.dataQuitacao ?? conta.vencimento)}
                              </span>
                            ) : atrasada ? (
                              <span className="stamp text-stamp">Atrasada</span>
                            ) : venceHoje ? (
                              <span className="stamp text-stamp">Vence hoje</span>
                            ) : (
                              <span className="text-xs font-medium text-ink-soft">Vence em {formatDate(conta.vencimento)}</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                        <p className={`font-ledger font-bold tabular-nums text-ink ${conta.quitado ? 'text-ink-soft line-through' : ''}`}>
                          {formatCurrency(conta.valor)}
                        </p>
                        <div className="flex items-center gap-1">
                          {!conta.quitado && conta.tipo === 'receber' && cliente && <WhatsAppChargeButton customerId={cliente.id} />}
                          {!conta.quitado && (
                            <button
                              onClick={() => {
                                if (conta.tipo === 'receber') {
                                  abrirConfirmacaoBaixa({
                                    tipo: 'fiado',
                                    id: conta.id,
                                    nome: cliente?.nome ?? conta.descricao,
                                    valor: conta.valor,
                                  });
                                } else {
                                  marcarContaQuitada(conta.id);
                                }
                              }}
                              className="rounded bg-ledger/10 px-2 py-1 text-xs font-medium text-ledger-strong dark:text-ledger"
                            >
                              Dar Baixa
                            </button>
                          )}
                          <button
                            onClick={() => setContaEditando(conta)}
                            aria-label="Editar conta"
                            className="rounded p-1.5 text-ink-soft transition hover:bg-line/40 hover:text-ink"
                          >
                            <PencilSimple size={14} />
                          </button>
                          <button
                            onClick={() => setItemParaExcluir({ tipo: 'conta', id: conta.id, label: conta.descricao })}
                            aria-label="Excluir conta"
                            className="rounded p-1.5 text-ink-soft transition hover:bg-stamp/10 hover:text-stamp"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                })}
                {lancamentosPaginados.map((lanc) => (
                  <li key={lanc.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{lanc.descricao}</p>
                      <p className="truncate text-[11px] text-ink-soft">{formatDate(lanc.data)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <p
                        className={`font-ledger text-sm font-bold tabular-nums ${
                          lanc.tipo === 'saida' ? 'text-stamp' : 'text-ledger-strong dark:text-ledger'
                        }`}
                      >
                        {lanc.tipo === 'saida' ? '-' : '+'} {formatCurrency(lanc.valor)}
                      </p>
                      <button
                        onClick={() => setLancamentoEditando(lanc)}
                        aria-label="Editar lançamento"
                        className="rounded p-1.5 text-ink-soft transition hover:bg-line/40 hover:text-ink"
                      >
                        <PencilSimple size={14} />
                      </button>
                      <button
                        onClick={() => setItemParaExcluir({ tipo: 'lancamento', id: lanc.id, label: lanc.descricao })}
                        aria-label="Excluir lançamento"
                        className="rounded p-1.5 text-ink-soft transition hover:bg-stamp/10 hover:text-stamp"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Pagination
            currentPage={paginacao.currentPage}
            totalItems={totalItensNaLista}
            onPageChange={setPagina}
            itemLabel={aba === 'pagar' ? 'contas e despesas' : 'contas a receber'}
          />
        </div>

        {mostrarPainelClientes && (
          <div className="mt-4 min-w-0 lg:sticky lg:top-20 lg:mt-0">
            <div className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <Users size={16} className="text-ink-soft" />
                <h3 className="text-xs font-bold uppercase tracking-wide text-ink-soft">Por Cliente</h3>
              </div>
              <ul className="divide-y divide-line">
                {clientesPaginados.items.map((c) => {
                  return (
                    <li key={c.id} className="py-2 text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-ink">{c.nome}</p>
                          {c.telefone && (
                            <p className="flex items-center gap-1 truncate text-[11px] text-ink-soft">
                              <Phone size={11} className="shrink-0" /> {c.telefone}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-ledger font-bold tabular-nums text-brass">{formatCurrency(c.total)}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3"><WhatsAppChargeButton customerId={c.id} />
                        <CustomerPrivacyActions customerId={c.id} customerName={c.nome} canAnonymize={user?.tenantRole === 'OWNER'} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <Pagination
                currentPage={clientesPaginados.currentPage}
                totalItems={saldoPorCliente.length}
                onPageChange={setPaginaClientes}
                itemLabel="clientes"
              />
            </div>
          </div>
        )}
      </div>

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title="Nova Despesa">
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Descrição</label>
            <input
              name="descricao"
              type="text"
              required
              placeholder="Ex: Conta de Luz"
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
              placeholder="Ex: 130,00"
              className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Vencimento</label>
            <input
              name="vencimento"
              type="date"
              required
              defaultValue={todayISO()}
              className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>
          <button type="submit" className="mt-2 w-full rounded-lg bg-ledger py-2.5 font-bold text-paper transition hover:bg-ledger-strong">
            Salvar Despesa
          </button>
        </form>
      </Modal>

      <Modal
        open={contaEditando !== null}
        onClose={() => setContaEditando(null)}
        title={contaEditando?.clienteId ? 'Editar Conta e Cliente' : 'Editar Conta'}
      >
        {contaEditando && (
          <form className="space-y-4" onSubmit={handleEditarContaSubmit} key={contaEditando.id}>
            {contaEditando.clienteId && (() => {
              const cliente = clientesPorId.get(contaEditando.clienteId);
              return (
                <fieldset className="space-y-3 rounded-xl border border-line bg-line/10 p-3">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-ink-soft">Dados do cliente</legend>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Nome</label>
                    <input
                      name="clienteNome"
                      type="text"
                      required
                      defaultValue={cliente?.nome ?? ''}
                      className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-ink-soft">Telefone</label>
                    <input
                      name="clienteTelefone"
                      type="tel"
                      defaultValue={cliente?.telefone ?? ''}
                      placeholder="Ex: (11) 99999-9999"
                      className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                    />
                  </div>
                </fieldset>
              );
            })()}
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Descrição</label>
              <input
                name="descricao"
                type="text"
                required
                defaultValue={contaEditando.descricao}
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
                defaultValue={contaEditando.valor.toString().replace('.', ',')}
                className="w-full rounded-lg border border-line bg-paper p-2 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Vencimento</label>
              <div className="relative">
                <input
                  name="vencimento"
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="DD/MM/AAAA"
                  pattern="\d{2}/\d{2}/\d{4}"
                  maxLength={10}
                  aria-describedby="formato-vencimento-edicao"
                  defaultValue={formatDateInput(contaEditando.vencimento)}
                  onInput={(e) => {
                    e.currentTarget.value = sanitizeDateInput(e.currentTarget.value);
                    e.currentTarget.setCustomValidity('');
                  }}
                  className="w-full rounded-lg border border-line bg-paper py-2 pl-2 pr-12 text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                />
                <CalendarBlank
                  aria-hidden="true"
                  size={20}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft"
                />
                <input
                  type="date"
                  aria-label="Escolher vencimento no calendário"
                  defaultValue={contaEditando.vencimento}
                  onChange={(e) => {
                    const textInput = e.currentTarget.parentElement?.querySelector<HTMLInputElement>('input[name="vencimento"]');
                    if (textInput && e.currentTarget.value) {
                      textInput.value = formatDateInput(e.currentTarget.value);
                      textInput.setCustomValidity('');
                    }
                  }}
                  className="absolute inset-y-0 right-0 w-12 cursor-pointer opacity-0"
                />
              </div>
              <p id="formato-vencimento-edicao" className="mt-1 text-[11px] text-ink-soft">Formato: dia/mês/ano</p>
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

      <Modal
        open={baixaPendente !== null}
        onClose={() => setBaixaPendente(null)}
        title={baixaPendente?.tipo === 'fiado' ? 'Confirmar baixa do fiado' : 'Confirmar pagamento da conta fixa'}
      >
        {baixaPendente && (
          <div className="space-y-5">
            <div className="rounded-xl border border-line bg-paper p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {baixaPendente.tipo === 'fiado' ? 'Cliente' : 'Conta fixa'}
              </p>
              <p className="mt-1 font-semibold text-ink">{baixaPendente.nome}</p>
              <p className="mt-3 font-ledger text-2xl font-bold tabular-nums text-ledger-strong dark:text-ledger">
                {formatCurrency(baixaPendente.valor)}
              </p>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">
                {baixaPendente.tipo === 'fiado' ? 'Forma de recebimento' : 'Forma de pagamento'}
              </span>
              <select
                value={formaBaixa}
                onChange={(event) => setFormaBaixa(event.target.value as Exclude<FormaPagamento, 'fiado'>)}
                className="w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink"
              >
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="cartao_credito">Cartão de crédito</option>
                <option value="cartao_debito">Cartão de débito</option>
              </select>
            </label>

            {baixaPendente.tipo === 'fixa' && formaBaixa !== 'dinheiro' && (
              <p className="rounded-lg bg-ledger/10 px-3 py-2 text-xs text-ledger-strong dark:text-ledger">
                O pagamento será registrado nos relatórios, mas não reduzirá o dinheiro físico esperado.
              </p>
            )}
            {baixaErro && <p className="text-sm font-medium text-stamp">{baixaErro}</p>}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setBaixaPendente(null)}
                className="flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium text-ink"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarBaixa()}
                disabled={baixando}
                className="flex-1 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-60"
              >
                {baixando ? 'Salvando…' : 'Confirmar baixa'}
              </button>
            </div>
          </div>
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
