import { useState } from 'react';
import { ArrowDown, ArrowUp, CheckCircle, Package, WarningCircle, Wrench } from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { formatCurrency, parseMoney, sanitizeIntegerInput, sanitizeMoneyInput } from '../lib/format';
import { TIPOS_DESPESA } from '../types';
import type { LancamentoManual, TipoDespesa, TipoEntrada } from '../types';
import Pagination from './Pagination';
import { paginateItems } from '../lib/pagination';
import { defaultEntryType, entryTypeOptionsForOffer } from '../lib/offering';
import Modal from './Modal';

const FORMAS_PAGAMENTO: Record<string, string> = {
  dinheiro: 'Dinheiro',
  pix: 'Pix',
  cartao_credito: 'Cartão',
  cartao_debito: 'Cartão',
};

type RevisaoPendencia = {
  lancamento: LancamentoManual;
  classificacao: TipoEntrada | TipoDespesa;
  produtoId?: string;
  quantidade?: number;
  itemNome?: string;
  valorCatalogo?: number;
};

export default function PendingIdentificationList({ lancamentos }: { lancamentos: LancamentoManual[] }) {
  const { data, resolverPendenciaNoBanco } = useAppData();
  const [selecoes, setSelecoes] = useState<Record<string, string>>({});
  const [itensSelecionados, setItensSelecionados] = useState<Record<string, string>>({});
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [resolvendoId, setResolvendoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);
  const [revisao, setRevisao] = useState<RevisaoPendencia | null>(null);
  const [substituirValor, setSubstituirValor] = useState(false);
  const [valorCorrigido, setValorCorrigido] = useState('');
  const lancamentosPaginados = paginateItems(lancamentos, pagina);
  const opcoesTipoEntrada = entryTypeOptionsForOffer(data.config?.oferta);
  const tipoEntradaPadrao = defaultEntryType(data.config?.oferta);
  const tiposEntradaPermitidos = opcoesTipoEntrada.map((opcao) => opcao.valor);

  const normalizarTipoEntrada = (valor?: string): TipoEntrada | undefined => {
    if (!valor) return undefined;
    return tiposEntradaPermitidos.includes(valor as TipoEntrada) ? valor as TipoEntrada : tipoEntradaPadrao;
  };

  const abrirConfirmacao = (lancamento: LancamentoManual) => {
    const classificacao = lancamento.tipo === 'entrada'
      ? normalizarTipoEntrada(selecoes[lancamento.id] ?? lancamento.tipoEntrada)
      : (selecoes[lancamento.id] ?? lancamento.tipoDespesa) as TipoDespesa | undefined;
    const exigeItemCatalogo = classificacao === 'produto' || classificacao === 'servico';
    const produtoId = itensSelecionados[lancamento.id];
    const quantidade = classificacao === 'produto' ? Number(quantidades[lancamento.id] ?? '1') : undefined;
    if (!classificacao) {
      setErro(
        lancamento.tipo === 'entrada'
          ? `Escolha ${opcoesTipoEntrada.map((opcao) => opcao.label).join(' ou ')} para confirmar a entrada.`
          : 'Escolha uma categoria para confirmar a despesa.',
      );
      return;
    }
    const itemCatalogo = exigeItemCatalogo
      ? data.produtos.find(
          (item) =>
            item.id === produtoId && item.type === (classificacao === 'produto' ? 'product' : 'service'),
        )
      : undefined;
    if (exigeItemCatalogo && !produtoId) {
      setErro(`Selecione qual ${classificacao === 'produto' ? 'produto' : 'serviço'} deseja abater.`);
      return;
    }
    if (exigeItemCatalogo && !itemCatalogo) {
      setErro(`${classificacao === 'produto' ? 'Produto' : 'Serviço'} não encontrado no catálogo.`);
      return;
    }
    if (classificacao === 'produto') {
      if (!Number.isInteger(quantidade) || Number(quantidade) <= 0) {
        setErro('Informe uma quantidade inteira maior que zero.');
        return;
      }
      if (itemCatalogo && Number(quantidade) > (itemCatalogo.quantidade ?? 0)) {
        setErro(`Estoque insuficiente. Disponível: ${itemCatalogo.quantidade ?? 0}.`);
        return;
      }
    }

    const valorCatalogo = itemCatalogo
      ? Math.round(itemCatalogo.precoVenda * (classificacao === 'produto' ? Number(quantidade) : 1) * 100) / 100
      : undefined;
    const valorSugerido = valorCatalogo ?? lancamento.valor;
    setRevisao({
      lancamento,
      classificacao,
      produtoId,
      quantidade,
      itemNome: itemCatalogo?.nome,
      valorCatalogo,
    });
    setValorCorrigido(valorSugerido.toFixed(2).replace('.', ','));
    setSubstituirValor(valorCatalogo !== undefined && Math.abs(valorCatalogo - lancamento.valor) >= 0.01);
    setErro(null);
  };

  const resolver = async () => {
    if (!revisao) return;
    const valorSubstituto = substituirValor ? parseMoney(valorCorrigido) : undefined;
    if (substituirValor && (!Number.isFinite(valorSubstituto) || Number(valorSubstituto) <= 0)) {
      setErro('Informe um valor corrigido maior que zero.');
      return;
    }

    setResolvendoId(revisao.lancamento.id);
    setErro(null);
    try {
      await resolverPendenciaNoBanco(
        revisao.lancamento.id,
        revisao.classificacao,
        revisao.produtoId,
        revisao.quantidade,
        valorSubstituto,
      );
      setSelecoes((atual) => {
        const proximo = { ...atual };
        delete proximo[revisao.lancamento.id];
        return proximo;
      });
      setItensSelecionados((atual) => {
        const proximo = { ...atual };
        delete proximo[revisao.lancamento.id];
        return proximo;
      });
      setQuantidades((atual) => {
        const proximo = { ...atual };
        delete proximo[revisao.lancamento.id];
        return proximo;
      });
      setRevisao(null);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível resolver a pendência.');
    } finally {
      setResolvendoId(null);
    }
  };

  const fecharRevisao = () => {
    if (resolvendoId) return;
    setRevisao(null);
    setErro(null);
  };

  const classificacaoRevisadaLabel = revisao
    ? entryTypeOptionsForOffer(data.config?.oferta).find((opcao) => opcao.valor === revisao.classificacao)?.label ??
      TIPOS_DESPESA.find((opcao) => opcao.valor === revisao.classificacao)?.label ??
      'Pendência'
    : '';
  const valorCatalogoDiferente = revisao?.valorCatalogo !== undefined &&
    Math.abs(revisao.valorCatalogo - revisao.lancamento.valor) >= 0.01;
  const valorFinal = substituirValor ? parseMoney(valorCorrigido) : revisao?.lancamento.valor ?? 0;

  return (
    <div className="space-y-3">
      {lancamentosPaginados.items.map((lancamento) => {
        const entrada = lancamento.tipo === 'entrada';
        const Icon = entrada ? ArrowUp : ArrowDown;
        const classificacao = entrada
          ? normalizarTipoEntrada(selecoes[lancamento.id] ?? lancamento.tipoEntrada) ?? ''
          : (selecoes[lancamento.id] ?? lancamento.tipoDespesa ?? '') as TipoDespesa | '';
        const exigeItemCatalogo = classificacao === 'produto' || classificacao === 'servico';
        const tipoCatalogo = classificacao === 'produto' ? 'product' : 'service';
        const itensCatalogo = exigeItemCatalogo
          ? data.produtos.filter((item) => item.type === tipoCatalogo)
          : [];
        const itemSelecionado = itensCatalogo.find((item) => item.id === itensSelecionados[lancamento.id]);
        const quantidadeInformada = Number(quantidades[lancamento.id] ?? '1');
        const quantidadeValida = classificacao !== 'produto' || (
          Number.isInteger(quantidadeInformada) &&
          quantidadeInformada > 0 &&
          quantidadeInformada <= (itemSelecionado?.quantidade ?? 0)
        );
        const podeResolver = Boolean(classificacao) &&
          (!exigeItemCatalogo || Boolean(itemSelecionado)) &&
          quantidadeValida;

        return (
          <article key={lancamento.id} className="rounded-xl border border-brass/30 bg-paper p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className={`mt-0.5 rounded-lg p-1.5 ${entrada ? 'bg-ledger/10 text-ledger-strong' : 'bg-stamp/10 text-stamp'}`}>
                  <Icon size={15} weight="bold" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{lancamento.descricao}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {entrada ? 'Entrada' : 'Despesa'} · {FORMAS_PAGAMENTO[lancamento.formaPagamento ?? ''] ?? 'Forma não informada'}
                  </p>
                </div>
              </div>
              <span className={`shrink-0 font-ledger text-sm font-bold ${entrada ? 'text-ledger-strong dark:text-ledger' : 'text-stamp'}`}>
                {entrada ? '+ ' : '- '}{formatCurrency(lancamento.valor)}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {entrada ? (
                <div
                  data-selected={classificacao}
                  data-choice-position={
                    ['first', 'second', 'third'][
                      Math.max(0, opcoesTipoEntrada.findIndex((opcao) => opcao.valor === classificacao))
                    ]
                  }
                  className={`segmented-slider pending-type-selector grid rounded-xl border border-line bg-line/40 p-1 ${
                    opcoesTipoEntrada.length === 2
                      ? 'segmented-slider-2 grid-cols-2'
                      : 'segmented-slider-3 grid-cols-3'
                  }`}
                  aria-label="Classificar entrada"
                >
                  {opcoesTipoEntrada.map((opcao) => {
                    const selecionada = classificacao === opcao.valor;
                    const OpcaoIcon = opcao.valor === 'produto' ? Package : opcao.valor === 'servico' ? Wrench : CheckCircle;
                    return (
                      <button
                        key={opcao.valor}
                        type="button"
                        aria-pressed={selecionada}
                        onClick={() => {
                          setSelecoes((atual) => ({ ...atual, [lancamento.id]: opcao.valor }));
                          setItensSelecionados((atual) => {
                            const proximo = { ...atual };
                            delete proximo[lancamento.id];
                            return proximo;
                          });
                          setQuantidades((atual) => ({ ...atual, [lancamento.id]: '1' }));
                          setErro(null);
                        }}
                        className={`selection-option flex min-w-0 items-center justify-center gap-1 rounded-lg border-0 px-2 py-2 text-xs font-semibold ${
                          selecionada
                            ? opcao.valor === 'produto'
                              ? 'bg-ledger text-paper shadow-sm'
                              : opcao.valor === 'servico'
                                ? 'bg-brass text-paper shadow-sm'
                                : 'bg-paper-raised text-ink shadow-sm'
                            : 'bg-transparent text-ink-soft hover:text-ink'
                        }`}
                      >
                        <OpcaoIcon size={14} className="shrink-0" />
                        <span className="truncate">{opcao.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <select
                  value={classificacao}
                  onChange={(event) => {
                    setSelecoes((atual) => ({ ...atual, [lancamento.id]: event.target.value }));
                    setErro(null);
                  }}
                  aria-label="Classificar despesa"
                  className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                >
                  <option value="">Categoria da despesa</option>
                  {TIPOS_DESPESA.map((opcao) => (
                    <option key={opcao.valor} value={opcao.valor}>{opcao.label}</option>
                  ))}
                </select>
              )}

              {entrada && exigeItemCatalogo && (
                <div
                  key={classificacao}
                  data-kind={tipoCatalogo}
                  className={`pending-fields-enter ${
                    classificacao === 'produto' ? 'grid gap-2 sm:grid-cols-[minmax(0,1fr)_7rem]' : ''
                  }`}
                >
                <label className="block min-w-0">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                    {classificacao === 'produto' ? 'Qual produto?' : 'Qual serviço?'}
                  </span>
                  <select
                    value={itensSelecionados[lancamento.id] ?? ''}
                    onChange={(event) => {
                      setItensSelecionados((atual) => ({ ...atual, [lancamento.id]: event.target.value }));
                      setErro(null);
                    }}
                    aria-label={classificacao === 'produto' ? 'Selecionar produto' : 'Selecionar serviço'}
                    className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                  >
                    <option value="">
                      {itensCatalogo.length > 0
                        ? `Selecione ${classificacao === 'produto' ? 'o produto' : 'o serviço'}`
                        : `Nenhum ${classificacao === 'produto' ? 'produto' : 'serviço'} cadastrado`}
                    </option>
                    {itensCatalogo.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nome} · {formatCurrency(item.precoVenda)}
                        {item.type === 'product' ? ` · estoque: ${item.quantidade ?? 0}` : item.duracao ? ` · ${item.duracao}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
                {classificacao === 'produto' && (
                  <label className="block">
                    <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                      Unidades
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantidades[lancamento.id] ?? '1'}
                      onChange={(event) => {
                        setQuantidades((atual) => ({
                          ...atual,
                          [lancamento.id]: sanitizeIntegerInput(event.target.value),
                        }));
                        setErro(null);
                      }}
                      aria-label="Unidades do produto"
                      className="w-full rounded-lg border border-line bg-paper-raised px-3 py-2 text-center font-ledger text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                    />
                  </label>
                )}
                </div>
              )}

              <button
                type="button"
                onClick={() => abrirConfirmacao(lancamento)}
                disabled={resolvendoId !== null || !podeResolver}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-ledger px-3 py-2.5 text-xs font-bold text-paper transition-colors hover:bg-ledger-strong disabled:opacity-45"
              >
                <CheckCircle size={16} weight="fill" />
                {resolvendoId === lancamento.id ? 'Abatendo…' : 'Abater pendência'}
              </button>
            </div>
          </article>
        );
      })}

      {erro && !revisao && (
        <p className="flex items-start gap-1.5 rounded-lg bg-stamp/10 px-3 py-2 text-xs font-medium text-stamp">
          <WarningCircle size={15} className="mt-0.5 shrink-0" /> {erro}
        </p>
      )}
      <Pagination
        currentPage={lancamentosPaginados.currentPage}
        totalItems={lancamentos.length}
        onPageChange={setPagina}
        itemLabel="pendências"
      />

      <Modal open={revisao !== null} onClose={fecharRevisao} title="Confirmar abatimento">
        {revisao && (
          <div className="space-y-4">
            <div className="rounded-xl border border-line bg-paper p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Lançamento</p>
              <p className="mt-1 font-semibold text-ink">{revisao.lancamento.descricao}</p>
              <p className="mt-1 text-xs text-ink-soft">
                {classificacaoRevisadaLabel}
                {revisao.itemNome ? ` · ${revisao.itemNome}` : ''}
                {revisao.quantidade && revisao.quantidade > 1 ? ` · ${revisao.quantidade} unidades` : ''}
              </p>
            </div>

            <div className={`grid gap-3 ${revisao.valorCatalogo !== undefined ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <div className="rounded-xl border border-line bg-paper p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Valor lançado</p>
                <p className="mt-1 font-ledger text-lg font-bold text-ink">
                  {formatCurrency(revisao.lancamento.valor)}
                </p>
              </div>
              {revisao.valorCatalogo !== undefined && (
                <div className={`rounded-xl border p-3 ${
                  valorCatalogoDiferente ? 'border-brass/50 bg-brass/10' : 'border-ledger/30 bg-ledger/5'
                }`}>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Valor do catálogo</p>
                  <p className={`mt-1 font-ledger text-lg font-bold ${
                    valorCatalogoDiferente ? 'text-brass' : 'text-ledger-strong dark:text-ledger'
                  }`}>
                    {formatCurrency(revisao.valorCatalogo)}
                  </p>
                </div>
              )}
            </div>

            {valorCatalogoDiferente && (
              <p className="flex items-start gap-2 rounded-xl border border-brass/30 bg-brass/10 p-3 text-xs font-medium text-brass">
                <WarningCircle size={17} className="mt-0.5 shrink-0" />
                O valor digitado é diferente do total calculado pelo catálogo. Revise antes de confirmar.
              </p>
            )}

            <fieldset>
              <legend className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                {revisao.lancamento.tipo === 'entrada' ? 'Valor que entrará no caixa' : 'Valor que sairá do caixa'}
              </legend>
              <div
                data-selected={substituirValor ? 'substituir' : 'manter'}
                data-choice-position={substituirValor ? 'second' : 'first'}
                className="segmented-slider segmented-slider-2 neutral-tabs-selector grid grid-cols-2 rounded-xl border border-line bg-line/40 p-1"
              >
                <button
                  type="button"
                  aria-pressed={!substituirValor}
                  onClick={() => {
                    setSubstituirValor(false);
                    setErro(null);
                  }}
                  className={`selection-option rounded-lg border-0 px-2 py-2.5 text-xs font-semibold ${
                    !substituirValor ? 'bg-paper-raised text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Manter lançado
                </button>
                <button
                  type="button"
                  aria-pressed={substituirValor}
                  onClick={() => {
                    setSubstituirValor(true);
                    setErro(null);
                  }}
                  className={`selection-option rounded-lg border-0 px-2 py-2.5 text-xs font-semibold ${
                    substituirValor ? 'bg-paper-raised text-ledger-strong shadow-sm dark:text-ledger' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  Substituir valor
                </button>
              </div>
            </fieldset>

            {substituirValor && (
              <label className="pending-fields-enter block">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">
                  Novo valor
                </span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-ledger text-sm font-bold text-ink-soft">R$</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorCorrigido}
                    onChange={(event) => {
                      setValorCorrigido(sanitizeMoneyInput(event.target.value));
                      setErro(null);
                    }}
                    aria-label="Novo valor da pendência"
                    className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-3 font-ledger text-lg font-bold text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                  />
                </div>
                {revisao.valorCatalogo !== undefined && (
                  <button
                    type="button"
                    onClick={() => setValorCorrigido(revisao.valorCatalogo!.toFixed(2).replace('.', ','))}
                    className="mt-1 text-xs font-semibold text-ledger-strong hover:underline dark:text-ledger"
                  >
                    Usar valor do catálogo: {formatCurrency(revisao.valorCatalogo)}
                  </button>
                )}
              </label>
            )}

            {erro && (
              <p className="flex items-start gap-1.5 rounded-lg bg-stamp/10 px-3 py-2 text-xs font-medium text-stamp">
                <WarningCircle size={15} className="mt-0.5 shrink-0" /> {erro}
              </p>
            )}

            <div className="rounded-xl bg-line/30 px-3 py-2 text-center text-xs text-ink-soft">
              Valor final: <strong className="font-ledger text-ink">{formatCurrency(Number.isFinite(valorFinal) ? valorFinal : 0)}</strong>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={fecharRevisao}
                disabled={resolvendoId !== null}
                className="rounded-xl border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink transition hover:bg-line/30 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void resolver()}
                disabled={resolvendoId !== null}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-ledger px-4 py-3 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:opacity-50"
              >
                <CheckCircle size={17} weight="fill" />
                {resolvendoId ? 'Abatendo…' : 'Confirmar e abater'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
