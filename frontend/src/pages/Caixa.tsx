import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MagnifyingGlass,
  Camera,
  ShoppingCartSimple,
  CheckCircle,
  Money,
  QrCode,
  CreditCard,
  BookBookmark,
  Trash,
  UserCirclePlus,
  Check,
  LockKey,
  WarningCircle,
} from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { formatCurrency, parseMoney, sanitizeIntegerInput, sanitizeMoneyInput } from '../lib/format';
import { catalogTypesForOffer } from '../lib/offering';
import type { Cliente, FormaPagamento } from '../types';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import { OfflineSalesQueue } from '../lib/offlineSales';
import { registerOfflineSaleRequest } from '../lib/business';
import { APP_DATA_CHANGED_EVENT } from '../lib/storage';
import OfflineStatus from '../components/OfflineStatus';
import ReceiptActions from '../components/ReceiptActions';
import { DEFAULT_RECEIPT_SETTINGS, type SaleReceipt } from '../lib/printing';

interface ItemCarrinho {
  key: string;
  produtoId?: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
}

interface ConfirmacaoCobranca {
  total: number;
  forma: FormaPagamento;
  quantidadeItens: number;
  cliente?: string;
  receipt?: SaleReceipt;
}

type BrowserBarcodeDetector = {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>;
};

const FORMAS: { forma: FormaPagamento; label: string; Icon: typeof Money; classes: string }[] = [
  { forma: 'dinheiro', label: 'Dinheiro', Icon: Money, classes: 'bg-line/50 text-ink' },
  { forma: 'pix', label: 'Pix', Icon: QrCode, classes: 'bg-ledger/15 text-ledger-strong dark:text-ledger' },
  { forma: 'cartao_credito', label: 'Cartão', Icon: CreditCard, classes: 'bg-line/50 text-ink' },
  { forma: 'fiado', label: 'Fiado', Icon: BookBookmark, classes: 'bg-brass/15 text-brass' },
];

export default function Caixa() {
  const { user, locked } = useAuth();
  const navigate = useNavigate();
  const {
    data,
    cadastrarClienteNoBanco,
    abrirCaixa,
  } = useAppData();
  const [busca, setBusca] = useState('');
  const [quantidadeProduto, setQuantidadeProduto] = useState('1');
  const [valorAvulso, setValorAvulso] = useState('');
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [formaSelecionada, setFormaSelecionada] = useState<FormaPagamento | null>(null);

  const [clienteSelecionado, setClienteSelecionado] = useState<Cliente | null>(null);
  const [buscaCliente, setBuscaCliente] = useState('');
  const [novoClienteNome, setNovoClienteNome] = useState('');
  const [novoClienteTelefone, setNovoClienteTelefone] = useState('');
  const [cadastrandoCliente, setCadastrandoCliente] = useState(false);
  const [confirmacaoCobranca, setConfirmacaoCobranca] = useState<ConfirmacaoCobranca | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroOperacao, setErroOperacao] = useState<string | null>(null);
  const [modalAbertura, setModalAbertura] = useState(false);
  const [valorInicial, setValorInicial] = useState('');
  const [scannerAberto, setScannerAberto] = useState(false);
  const [codigoScanner, setCodigoScanner] = useState('');
  const [scannerErro, setScannerErro] = useState<string | null>(null);
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const offlineQueue = useMemo(() => new OfflineSalesQueue({
    getIdentity: () => !locked && user?.tenantId ? { tenantId: user.tenantId, actorId: user.id } : null,
    send: async (sale, signal) => {
      const response = await registerOfflineSaleRequest(sale.payload, signal);
      window.dispatchEvent(new CustomEvent(APP_DATA_CHANGED_EVENT, { detail: response.data }));
    },
  }), [locked, user]);
  useEffect(() => offlineQueue.start(), [offlineQueue]);
  const tiposCatalogoPermitidos = useMemo(
    () => catalogTypesForOffer(data.config?.oferta),
    [data.config?.oferta],
  );

  const resultados = useMemo(() => {
    if (!busca.trim()) return [];
    const termo = busca.trim().toLowerCase();
    return data.produtos
      .filter((p) => tiposCatalogoPermitidos.includes(p.type) && p.nome.toLowerCase().includes(termo))
      .slice(0, 6);
  }, [busca, data.produtos, tiposCatalogoPermitidos]);

  const clientesFiltrados = useMemo(() => {
    const termo = buscaCliente.trim().toLowerCase();
    if (!termo) return data.clientes.slice(0, 6);
    return data.clientes.filter((c) => c.nome.toLowerCase().includes(termo)).slice(0, 6);
  }, [buscaCliente, data.clientes]);

  const total = carrinho.reduce((sum, item) => sum + item.quantidade * item.valorUnitario, 0);
  const valorAvulsoValido = parseMoney(valorAvulso) > 0;
  const quantidadeProdutoSelecionada = Math.max(1, Number(quantidadeProduto) || 1);

  const adicionarProduto = (produtoId: string) => {
    const produto = data.produtos.find(
      (p) => p.id === produtoId && tiposCatalogoPermitidos.includes(p.type),
    );
    if (!produto) return;

    const jaNoCarrinho = carrinho.find((i) => i.produtoId === produtoId)?.quantidade ?? 0;
    if (
      produto.type === 'product' &&
      jaNoCarrinho + quantidadeProdutoSelecionada > (produto.quantidade ?? 0)
    ) {
      alert(`Estoque insuficiente: só há ${produto.quantidade ?? 0} unidade(s) de "${produto.nome}" disponível.`);
      return;
    }

    setCarrinho((prev) => {
      const existente = prev.find((i) => i.produtoId === produtoId);
      if (existente) {
        return prev.map((i) =>
          i.produtoId === produtoId
            ? { ...i, quantidade: i.quantidade + quantidadeProdutoSelecionada }
            : i,
        );
      }
      return [
        ...prev,
        {
          key: produto.id,
          produtoId: produto.id,
          descricao: produto.nome,
          quantidade: quantidadeProdutoSelecionada,
          valorUnitario: produto.precoVenda,
        },
      ];
    });
    setBusca('');
    setQuantidadeProduto('1');
  };

  const adicionarAvulso = () => {
    const valor = parseMoney(valorAvulso);
    if (!valor || valor <= 0) return;
    setCarrinho((prev) => [
      ...prev,
      { key: `avulso-${Date.now()}-${prev.length}`, descricao: 'Diversos', quantidade: 1, valorUnitario: valor },
    ]);
    setValorAvulso('');
  };

  const removerItem = (key: string) => {
    setCarrinho((prev) => prev.filter((i) => i.key !== key));
  };

  const lerCodigo = () => {
    setCodigoScanner('');
    const supportsCamera = 'BarcodeDetector' in window && Boolean(navigator.mediaDevices?.getUserMedia);
    setScannerErro(supportsCamera ? null : 'Câmera indisponível neste navegador. Digite o código ou use um leitor USB/Bluetooth.');
    setScannerAberto(true);
  };

  const adicionarPorCodigo = (event?: FormEvent) => {
    event?.preventDefault();
    const codigo = codigoScanner.trim();
    const produto = data.produtos.find(
      (item) => item.codigoBarras === codigo && tiposCatalogoPermitidos.includes(item.type),
    );
    if (!produto) {
      setScannerErro('Nenhum item ativo foi encontrado com esse código.');
      return;
    }
    adicionarProduto(produto.id);
    setScannerAberto(false);
  };

  useEffect(() => {
    if (!scannerAberto) return;
    let active = true;
    let frame = 0;
    let stream: MediaStream | null = null;
    const BarcodeDetectorCtor = (window as Window & {
      BarcodeDetector?: new (options?: { formats?: string[] }) => BrowserBarcodeDetector;
    }).BarcodeDetector;

    if (!BarcodeDetectorCtor || !navigator.mediaDevices?.getUserMedia) return;

    const videoElement = scannerVideoRef.current;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        const video = videoElement;
        if (!active || !video) return;
        video.srcObject = stream;
        await video.play();
        const detector = new BarcodeDetectorCtor({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] });
        const scan = async () => {
          if (!active) return;
          try {
            const codes = await detector.detect(video);
            if (codes[0]?.rawValue) {
              setCodigoScanner(codes[0].rawValue);
              setScannerErro(null);
              return;
            }
          } catch {
            // Quadros sem leitura são normais; o próximo quadro tenta de novo.
          }
          frame = requestAnimationFrame(() => void scan());
        };
        void scan();
      } catch {
        if (active) setScannerErro('Não foi possível acessar a câmera. Confira a permissão ou digite o código.');
      }
    };
    void start();
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoElement) videoElement.srcObject = null;
    };
  }, [scannerAberto]);

  const selecionarForma = (forma: FormaPagamento) => {
    setFormaSelecionada(forma);
    if (forma !== 'fiado') {
      setClienteSelecionado(null);
      setCadastrandoCliente(false);
    }
  };

  const cadastrarCliente = async () => {
    if (!novoClienteNome.trim()) return;
    setSalvando(true);
    setErroOperacao(null);
    try {
      const cliente = await cadastrarClienteNoBanco({
        nome: novoClienteNome.trim(),
        telefone: novoClienteTelefone.trim() || undefined,
      });
      setClienteSelecionado(cliente);
      setCadastrandoCliente(false);
      setNovoClienteNome('');
      setNovoClienteTelefone('');
    } catch (error) {
      setErroOperacao(error instanceof Error ? error.message : 'Não foi possível cadastrar o cliente.');
    } finally {
      setSalvando(false);
    }
  };

  const finalizarVenda = async () => {
    if (!podeFinalizar) return;

    // reconfere contra o estoque atual — protege contra edições no Estoque
    // feitas depois que o item já estava no carrinho
    for (const item of carrinho) {
      if (item.quantidade <= 0 || item.valorUnitario <= 0) {
        alert('Item de venda inválido: quantidade e valor precisam ser maiores que zero.');
        return;
      }
      if (item.produtoId) {
        const produtoAtual = data.produtos.find((p) => p.id === item.produtoId);
        if (
          produtoAtual &&
          produtoAtual.type === 'product' &&
          (produtoAtual.quantidade ?? 0) < item.quantidade
        ) {
          alert(
            `Estoque insuficiente: só há ${produtoAtual.quantidade ?? 0} unidade(s) de "${item.descricao}" disponível.`,
          );
          return;
        }
      }
    }

    const formaCobranca = formaSelecionada!;
    const confirmacao: ConfirmacaoCobranca = {
      total,
      forma: formaCobranca,
      quantidadeItens: carrinho.reduce((quantidade, item) => quantidade + item.quantidade, 0),
      cliente: clienteSelecionado?.nome,
    };
    setSalvando(true);
    setErroOperacao(null);
    try {
      const saleItems = carrinho.map((item) => ({
          productId: item.produtoId,
          description: item.descricao,
          quantity: item.quantidade,
          unitPrice: item.valorUnitario,
        }));
      const cashSessionId = data.caixaAtual?.id;
      if (!cashSessionId) throw new Error('Abra o caixa antes de registrar a venda.');
      const pending = await offlineQueue.enqueue({ items: saleItems, paymentMethod: formaCobranca,
        customerId: formaCobranca === 'fiado' ? clienteSelecionado?.id : undefined, cashSessionId }, {
        businessName: data.config?.nome ?? 'CaixaFácil', operatorName: user?.name ?? user?.email ?? 'Operador',
        paymentMethod: formaCobranca,
        items: saleItems.map(item => ({ description: item.description, quantity: item.quantity, unitPrice: item.unitPrice })),
      });
      if (navigator.onLine) await offlineQueue.sync();
      confirmacao.receipt = pending.receipt ? { ...pending.receipt, pendingSync: offlineQueue.getSnapshot().pending > 0 } : undefined;
      setCarrinho([]);
      setFormaSelecionada(null);
      setClienteSelecionado(null);
      setConfirmacaoCobranca(confirmacao);
    } catch (error) {
      setErroOperacao(error instanceof Error ? error.message : 'Não foi possível registrar a venda.');
    } finally {
      setSalvando(false);
    }
  };

  const abrirNovoCaixa = async () => {
    const inicial = valorInicial.trim() ? parseMoney(valorInicial) : 0;
    if (!Number.isFinite(inicial) || inicial < 0) return;
    setSalvando(true);
    setErroOperacao(null);
    try {
      await abrirCaixa(inicial);
      setModalAbertura(false);
      setValorInicial('');
    } catch (error) {
      setErroOperacao(error instanceof Error ? error.message : 'Não foi possível abrir o caixa.');
    } finally {
      setSalvando(false);
    }
  };

  const precisaCliente = formaSelecionada === 'fiado';
  const podeFinalizar =
    data.caixaAtual !== null && !salvando && carrinho.length > 0 && formaSelecionada !== null && (!precisaCliente || clienteSelecionado !== null);
  const caixa = data.caixaAtual;

  return (
    <div className="fade-in">
      <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-bold text-ink">Frente de Caixa</h2>
            <div className="mt-2.5"><OfflineStatus queue={offlineQueue} /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={lerCodigo}
              disabled={!caixa}
              className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-ledger/25 bg-ledger/5 px-4 py-2 text-sm font-semibold text-ledger-strong transition hover:bg-ledger/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-ledger sm:flex-none"
            >
              <Camera size={18} weight="bold" /> Ler código
            </button>
            {caixa ? (
              <button
                onClick={() => navigate('/caixa/fechamento')}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-stamp/25 bg-stamp/5 px-4 py-2 text-sm font-semibold text-stamp transition hover:bg-stamp/10 sm:flex-none"
              >
                <LockKey size={18} weight="bold" /> Fechar caixa
              </button>
            ) : (
              <button
                onClick={() => {
                  setErroOperacao(null);
                  setModalAbertura(true);
                }}
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-ledger px-4 py-2 text-sm font-bold text-paper transition hover:bg-ledger-strong sm:flex-none"
              >
                <Money size={18} weight="bold" /> Abrir caixa
              </button>
            )}
          </div>
        </div>

        {caixa ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ledger/15 bg-ledger/5 px-4 py-3 sm:px-5">
            <span className="inline-flex items-center gap-2 text-sm font-semibold text-ledger-strong dark:text-ledger">
              <span className="h-2.5 w-2.5 rounded-full bg-ledger shadow-[0_0_0_4px_rgba(20,120,80,0.12)]" />
              Caixa aberto
            </span>
            <span className="text-xs text-ink-soft">Saldo inicial <strong className="ml-1 font-ledger text-sm tabular-nums text-ink">{formatCurrency(caixa.valorInicial)}</strong></span>
          </div>
        ) : (
          <div className="border-t border-brass/20 bg-brass/10 px-4 py-3 sm:px-5">
            <p className="text-sm font-semibold text-brass">O caixa está fechado</p>
            <p className="mt-1 text-xs text-ink-soft">Abra um novo caixa para registrar vendas e movimentações.</p>
          </div>
        )}
      </section>

      {erroOperacao && !modalAbertura && (
        <div className="mb-3 flex items-start gap-2 rounded-xl bg-stamp/10 p-3 text-sm text-stamp">
          <WarningCircle size={18} className="mt-0.5 shrink-0" /> {erroOperacao}
        </div>
      )}

      <div className={`receipt-edge flex h-[60vh] flex-col rounded-2xl border border-line bg-paper-raised p-4 pb-6 shadow-sm lg:h-[65vh] ${!caixa ? 'pointer-events-none opacity-45' : ''}`}>
        <div className="relative mb-2">
          <div className="grid grid-cols-[minmax(0,1fr)_68px] gap-2">
            <div className="relative min-w-0">
              <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={
                  tiposCatalogoPermitidos.length > 1
                    ? 'Buscar produto ou serviço...'
                    : tiposCatalogoPermitidos[0] === 'service'
                      ? 'Buscar serviço...'
                      : 'Buscar produto...'
                }
                className="w-full rounded-xl border border-line bg-paper py-3 pl-10 pr-3 text-ink focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ledger"
              />
            </div>
            <label className="relative">
              <span className="sr-only">Quantidade de itens</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={quantidadeProduto}
                onChange={(e) => setQuantidadeProduto(sanitizeIntegerInput(e.target.value))}
                onBlur={() => {
                  if (!quantidadeProduto || Number(quantidadeProduto) < 1) setQuantidadeProduto('1');
                }}
                aria-label="Quantidade de itens"
                className="w-full rounded-xl border border-line bg-paper py-3 pl-2 pr-7 text-center font-ledger text-sm font-bold tabular-nums text-ink focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ledger"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase text-ink-soft">
                un.
              </span>
            </label>
          </div>
          {resultados.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-xl border border-line bg-paper-raised shadow-lg">
              {resultados.map((p) => {
                const jaNoCarrinho = carrinho.find((item) => item.produtoId === p.id)?.quantidade ?? 0;
                const estoque = p.quantidade ?? 0;
                const estoqueInsuficiente =
                  p.type === 'product' && jaNoCarrinho + quantidadeProdutoSelecionada > estoque;

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => adicionarProduto(p.id)}
                    disabled={estoqueInsuficiente}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition hover:bg-line/30 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className="min-w-0 truncate text-ink">
                      {p.nome}{' '}
                      <span className="font-ledger text-xs font-bold text-ink-soft">
                        {p.type === 'product' ? `× ${estoque} un.` : '· Serviço'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-ledger text-ink-soft">{formatCurrency(p.precoVenda)}</span>
                      {estoqueInsuficiente && (
                        <span className="block text-[9px] font-semibold text-stamp">Estoque insuficiente</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="mb-3 rounded-xl border border-line bg-paper p-2.5">
          <div className="mb-2 flex items-center justify-between gap-3 px-0.5">
            <span className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Venda avulsa</span>
            <span className="text-[10px] text-ink-soft">Item sem cadastro</span>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
            <label className="relative min-w-0">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 border-r border-line pr-2 font-ledger text-sm font-bold text-ledger-strong dark:text-ledger">
                R$
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={valorAvulso}
                onChange={(e) => setValorAvulso(sanitizeMoneyInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') adicionarAvulso();
                }}
                placeholder="0,00"
                aria-label="Valor da venda avulsa"
                className="w-full rounded-xl border border-line bg-paper-raised py-2.5 pl-14 pr-3 font-ledger text-base font-bold tabular-nums text-ink placeholder:font-normal placeholder:text-ink-soft/70 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ledger"
              />
            </label>
            <button
              type="button"
              onClick={adicionarAvulso}
              disabled={!valorAvulsoValido}
              className="whitespace-nowrap rounded-xl bg-ledger px-4 text-sm font-bold text-paper shadow-sm transition hover:bg-ledger-strong disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-soft disabled:shadow-none"
            >
              Adicionar
            </button>
          </div>
        </div>

        <div className="mb-2 flex-1 overflow-y-auto border-b border-line pb-2">
          {carrinho.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-ink-soft">
              <ShoppingCartSimple size={40} className="mb-2 opacity-60" />
              <p className="text-center text-sm">
                Adicione produtos ou <br />
                digite um valor avulso.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {carrinho.map((item) => (
                <li key={item.key} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{item.descricao}</p>
                    <p className="font-ledger text-xs text-ink-soft">
                      {item.quantidade} un. × {formatCurrency(item.valorUnitario)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-ledger text-sm font-bold tabular-nums text-ink">
                      {formatCurrency(item.quantidade * item.valorUnitario)}
                    </span>
                    <button onClick={() => removerItem(item.key)} className="text-ink-soft hover:text-stamp">
                      <Trash size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-auto">
          <div className="mb-4 flex items-center justify-between">
            <span className="font-medium text-ink-soft">Total a Pagar</span>
            <span className="font-ledger text-2xl font-bold tabular-nums text-ledger-strong dark:text-ledger">
              {formatCurrency(total)}
            </span>
          </div>

          <div className={`grid grid-cols-4 gap-2 ${carrinho.length === 0 ? 'pointer-events-none opacity-50' : ''}`}>
            {FORMAS.map(({ forma, label, Icon, classes }) => (
              <button
                key={forma}
                onClick={() => selecionarForma(forma)}
                aria-pressed={formaSelecionada === forma}
                className={`selection-option flex flex-col items-center gap-1 rounded-lg py-2 text-xs font-medium ${classes} ${
                  formaSelecionada === forma ? 'ring-2 ring-ledger' : ''
                }`}
              >
                <Icon size={18} /> {label}
              </button>
            ))}
          </div>

          {precisaCliente && (
            <div className="fade-in mt-3 rounded-xl border border-brass/30 bg-brass/10 p-3">
              {clienteSelecionado ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-brass">
                    <Check size={16} weight="bold" className="shrink-0" />
                    <span className="min-w-0 truncate">{clienteSelecionado.nome}</span>
                  </div>
                  <button
                    onClick={() => setClienteSelecionado(null)}
                    className="shrink-0 text-xs font-medium text-brass underline"
                  >
                    Trocar
                  </button>
                </div>
              ) : cadastrandoCliente ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    autoFocus
                    value={novoClienteNome}
                    onChange={(e) => setNovoClienteNome(e.target.value)}
                    placeholder="Nome do cliente"
                    className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger"
                  />
                  <input
                    type="text"
                    value={novoClienteTelefone}
                    onChange={(e) => setNovoClienteTelefone(e.target.value)}
                    placeholder="Telefone (opcional)"
                    className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCadastrandoCliente(false)}
                      className="flex-1 rounded-lg bg-line/50 py-2 text-xs font-medium text-ink"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => void cadastrarCliente()}
                      disabled={salvando}
                      className="flex-1 rounded-lg bg-brass py-2 text-xs font-bold text-paper"
                    >
                      Cadastrar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-brass">Quem é o cliente?</p>
                  <input
                    type="text"
                    value={buscaCliente}
                    onChange={(e) => setBuscaCliente(e.target.value)}
                    placeholder="Buscar cliente cadastrado..."
                    className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger"
                  />
                  {clientesFiltrados.length > 0 && (
                    <ul className="max-h-28 overflow-y-auto rounded-lg border border-line bg-paper-raised">
                      {clientesFiltrados.map((c) => (
                        <li key={c.id}>
                          <button
                            onClick={() => setClienteSelecionado(c)}
                            className="w-full truncate px-3 py-2 text-left text-sm text-ink hover:bg-line/30"
                          >
                            {c.nome}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <button
                    onClick={() => setCadastrandoCliente(true)}
                    className="flex w-full items-center justify-center gap-1 rounded-lg border border-brass/40 py-2 text-xs font-medium text-brass"
                  >
                    <UserCirclePlus size={16} /> Cadastrar novo cliente
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => void finalizarVenda()}
            disabled={!podeFinalizar}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-bold text-paper shadow-md transition active:scale-[0.98] ${
              podeFinalizar ? 'bg-ledger hover:bg-ledger-strong' : 'cursor-not-allowed bg-ledger opacity-50'
            }`}
          >
            <CheckCircle size={20} /> {salvando ? 'Salvando…' : 'Cobrar'}
          </button>
        </div>
      </div>

      <Modal
        open={confirmacaoCobranca !== null}
        onClose={() => setConfirmacaoCobranca(null)}
        title="Cobrança registrada"
      >
        {confirmacaoCobranca && (
          <div className="space-y-5 text-center">
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${
                confirmacaoCobranca.forma === 'fiado'
                  ? 'bg-brass/10 text-brass'
                  : 'bg-ledger/10 text-ledger-strong dark:text-ledger'
              }`}
            >
              {confirmacaoCobranca.forma === 'fiado' ? (
                <BookBookmark size={32} weight="fill" />
              ) : (
                <CheckCircle size={32} weight="fill" />
              )}
            </div>

            <div>
              <p className="font-ledger text-3xl font-bold tabular-nums text-ink">
                {formatCurrency(confirmacaoCobranca.total)}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {confirmacaoCobranca.quantidadeItens} item(ns) ·{' '}
                {FORMAS.find((item) => item.forma === confirmacaoCobranca.forma)?.label}
              </p>
            </div>

            <div
              className={`rounded-xl p-3 text-left text-sm ${
                confirmacaoCobranca.forma === 'fiado'
                  ? 'bg-brass/10 text-brass'
                  : 'bg-ledger/10 text-ledger-strong dark:text-ledger'
              }`}
            >
              {confirmacaoCobranca.forma === 'fiado' ? (
                <>
                  <p className="font-semibold">Fiado registrado{confirmacaoCobranca.cliente ? ` para ${confirmacaoCobranca.cliente}` : ''}.</p>
                  <p className="mt-1 text-xs">Esse valor entrará no caixa somente quando o pagamento receber baixa.</p>
                </>
              ) : (
                <>
                  <p className="font-semibold">Entrada adicionada com sucesso.</p>
                  <p className="mt-1 text-xs">O valor já aparece nas movimentações e no saldo do caixa.</p>
                </>
              )}
            </div>

            {confirmacaoCobranca.receipt && <ReceiptActions receipt={confirmacaoCobranca.receipt}
              settings={data.config?.receiptSettings ?? DEFAULT_RECEIPT_SETTINGS} />}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmacaoCobranca(null)}
                className="flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-line/30"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => {
                  const destino = confirmacaoCobranca.forma === 'fiado' ? '/financas?tab=receber' : '/entradas';
                  setConfirmacaoCobranca(null);
                  navigate(destino);
                }}
                className="flex-1 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong"
              >
                {confirmacaoCobranca.forma === 'fiado' ? 'Ver em Finanças' : 'Ver em Entradas'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={modalAbertura} onClose={() => setModalAbertura(false)} title="Abrir novo caixa">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void abrirNovoCaixa();
          }}
        >
          <p className="text-sm text-ink-soft">Informe quanto há em dinheiro físico no início desta sessão.</p>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Valor inicial</label>
            <input
              autoFocus
              value={valorInicial}
              onChange={(event) => setValorInicial(sanitizeMoneyInput(event.target.value))}
              type="text"
              inputMode="decimal"
              placeholder="0,00"
              className="w-full rounded-xl border border-line bg-paper px-4 py-3 font-ledger text-xl text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>
          {erroOperacao && <p className="text-sm font-medium text-stamp">{erroOperacao}</p>}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setModalAbertura(false)}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-medium text-ink"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={salvando}
              className="flex-1 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-60"
            >
              {salvando ? 'Abrindo…' : 'Abrir Caixa'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={scannerAberto} onClose={() => setScannerAberto(false)} title="Ler código de barras">
        <form className="space-y-4" onSubmit={adicionarPorCodigo}>
          <video
            ref={scannerVideoRef}
            muted
            playsInline
            className="aspect-video w-full rounded-xl border border-line bg-black object-cover"
          />
          <p className="text-xs text-ink-soft">
            Aponte a câmera para o código. Leitores USB/Bluetooth também funcionam digitando diretamente no campo.
          </p>
          <input
            autoFocus
            value={codigoScanner}
            onChange={(event) => setCodigoScanner(event.target.value)}
            placeholder="Código de barras"
            inputMode="numeric"
            className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
          />
          {scannerErro && <p role="alert" className="text-xs font-medium text-stamp">{scannerErro}</p>}
          <button
            type="submit"
            disabled={!codigoScanner.trim()}
            className="w-full rounded-lg bg-ledger py-2.5 text-sm font-bold text-paper disabled:opacity-50"
          >
            Adicionar ao carrinho
          </button>
        </form>
      </Modal>

    </div>
  );
}
