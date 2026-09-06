import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppData,
  Cliente,
  CompanyConfig,
  Conta,
  LancamentoManual,
  Produto,
  Venda,
  ViewPeriod,
  FormaPagamento,
  TipoEntrada,
  TipoDespesa,
  TipoMovimentoCaixa,
} from '../types';
import {
  closeCashSessionRequest,
  createCategoryRequest,
  createProductRequest,
  deleteCategoryRequest,
  deleteFixedExpenseRequest,
  deleteProductRequest,
  openCashSessionRequest,
  payCreditRequest,
  payFixedExpenseRequest,
  registerCustomerRequest,
  registerFixedExpenseRequest,
  registerSaleRequest,
  registerTransactionRequest,
  reopenCashSessionRequest,
  resolveTransactionIdentificationRequest,
  saveSettingsRequest,
  updateCategoryRequest,
  updateProductRequest,
  type SaleItemInput,
} from '../lib/business';
import { decodeToken, getStoredToken } from '../lib/auth';
import {
  APP_DATA_CHANGED_EVENT,
  emptyData,
  loadData,
  saveData,
  storageKeyForUser,
  uid,
} from '../lib/storage';
import { todayISO } from '../lib/format';

interface ResumoPeriodo {
  vendas: number;
  despesas: number;
}

interface AppDataContextValue {
  data: AppData;
  loadedUserId: string | null;
  setConfig: (config: CompanyConfig) => Promise<void>;
  addVenda: (venda: Omit<Venda, 'id'>, opts?: { clienteId?: string }) => void;
  /**
   * Atualiza uma venda existente. Retorna `false` (e não faz nada) quando a venda
   * tem uma conta a receber (fiado) vinculada que já foi quitada e a edição sairia
   * do fiado — desfazer isso apagaria um recebimento que já aconteceu de fato.
   * Retorna `true` quando a edição foi aplicada.
   */
  editarVenda: (id: string, patch: Partial<Omit<Venda, 'id'>>) => boolean;
  /**
   * Remove uma venda. Se ela tiver uma conta a receber (fiado) vinculada e ainda em
   * aberto, a conta é removida junto (a dívida deixa de existir com a venda). Se a
   * conta vinculada já foi quitada, a remoção é bloqueada (retorna `false`) para não
   * apagar um recebimento que já aconteceu de fato.
   */
  removerVenda: (id: string) => boolean;
  addProduto: (produto: Omit<Produto, 'id'>) => Promise<void>;
  atualizarProduto: (id: string, patch: Partial<Omit<Produto, 'id'>>) => Promise<void>;
  removerProduto: (id: string) => Promise<void>;
  addCategoria: (nome: string) => Promise<boolean>;
  editarCategoria: (id: string, nome: string) => Promise<boolean>;
  removerCategoria: (id: string) => Promise<void>;
  addConta: (conta: Omit<Conta, 'id' | 'quitado'>) => void;
  editarConta: (id: string, patch: Partial<Omit<Conta, 'id'>>) => void;
  removerConta: (id: string) => void;
  marcarContaQuitada: (id: string, dataPagamento?: string) => void;
  addLancamentoManual: (lancamento: Omit<LancamentoManual, 'id'>) => void;
  editarLancamentoManual: (id: string, patch: Partial<Omit<LancamentoManual, 'id'>>) => void;
  removerLancamentoManual: (id: string) => void;
  addCliente: (cliente: Omit<Cliente, 'id'>) => Cliente;
  editarCliente: (id: string, patch: Partial<Omit<Cliente, 'id'>>) => void;
  registrarVendaNoBanco: (items: SaleItemInput[], forma: FormaPagamento, clienteId?: string) => Promise<void>;
  registrarLancamentoNoBanco: (input: {
    tipo: 'entrada' | 'saida';
    descricao: string;
    valor: number;
    formaPagamento: Exclude<FormaPagamento, 'fiado'>;
    tipoEntrada?: TipoEntrada;
    tipoDespesa?: TipoDespesa;
    movimentoCaixa?: TipoMovimentoCaixa;
  }) => Promise<void>;
  resolverPendenciaNoBanco: (
    id: string,
    classificacao: TipoEntrada | TipoDespesa,
    produtoId?: string,
    quantidade?: number,
    valorCorrigido?: number,
  ) => Promise<void>;
  cadastrarClienteNoBanco: (cliente: Omit<Cliente, 'id'>) => Promise<Cliente>;
  baixarFiado: (id: string, forma: Exclude<FormaPagamento, 'fiado'>) => Promise<void>;
  baixarDespesaFixa: (id: string, forma: Exclude<FormaPagamento, 'fiado'>) => Promise<void>;
  cadastrarDespesaFixaNoBanco: (input: {
    nome: string;
    valor: number;
    recorrencia: 'semanal' | 'mensal';
  }) => Promise<void>;
  removerDespesaFixaNoBanco: (id: string) => Promise<void>;
  abrirCaixa: (valorInicial: number, responsavel?: string) => Promise<void>;
  fecharCaixa: (dinheiroContado: number, permitirPendencias?: boolean) => Promise<void>;
  reabrirCaixa: (id: string) => Promise<void>;
  resetData: () => void;
  saldoCaixa: number;
  vendasHoje: number;
  despesasHoje: number;
  lucroEstimadoHoje: number;
  resumoPeriodo: ResumoPeriodo;
  vendasUltimos7Dias: { data: string; total: number }[];
  contasAPagarHoje: Conta[];
  contasAReceberEmAberto: Conta[];
  contasVencendoEmBreve: Conta[];
  contasVencidas: Conta[];
  contasQuitadasHoje: Conta[];
  produtosEstoqueBaixo: Produto[];
  totalNotificacoes: number;
}

const AppDataContext = createContext<AppDataContextValue | null>(null);

function ultimosNDias(hoje: string, n: number): string[] {
  const base = new Date(`${hoje}T00:00:00`);
  const dias: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

function diffDias(deIso: string, paraIso: string): number {
  const de = new Date(`${deIso}T00:00:00`);
  const para = new Date(`${paraIso}T00:00:00`);
  return Math.round((para.getTime() - de.getTime()) / 86_400_000);
}

function dataLocalISO(instante?: string): string | undefined {
  if (!instante) return undefined;
  const data = new Date(instante);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

function mesclarDadosDoBanco(prev: AppData, serverData: AppData): AppData {
  return {
    ...emptyData,
    ...serverData,
    config: serverData.config ?? prev.config,
  };
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const getAuthenticatedUserId = () => {
    const token = getStoredToken();
    return token ? decodeToken(token)?.sub ?? null : null;
  };
  const initialUserId = getAuthenticatedUserId();
  const activeUserIdRef = useRef<string | null>(initialUserId);
  const [data, setData] = useState<AppData>(() => loadData(initialUserId));
  const [loadedUserId, setLoadedUserId] = useState<string | null>(initialUserId);

  useEffect(() => {
    saveData(data, activeUserIdRef.current);
  }, [data]);

  useEffect(() => {
    const reloadAuthenticatedData = (event: Event) => {
      const userId = getAuthenticatedUserId();
      activeUserIdRef.current = userId;
      setLoadedUserId(userId);
      const serverData = (event as CustomEvent<AppData | null>).detail;
      setData((prev) => {
        if (!serverData) return userId ? loadData(userId) : emptyData;
        const configPersistida = userId ? loadData(userId).config : null;
        return mesclarDadosDoBanco(configPersistida ? { ...prev, config: configPersistida } : prev, serverData);
      });
    };

    window.addEventListener(APP_DATA_CHANGED_EVENT, reloadAuthenticatedData);
    return () => window.removeEventListener(APP_DATA_CHANGED_EVENT, reloadAuthenticatedData);
  }, []);

  useEffect(() => {
    // Sincroniza entre abas: se outra aba salvar (ou zerar) os dados, o
    // evento "storage" dispara aqui e recarregamos o estado local.
    //
    // O evento "storage" só dispara nas abas *diferentes* daquela que fez a
    // gravação (garantia da própria spec do navegador — a aba que escreveu
    // nunca recebe o próprio evento), então não precisa de guarda extra
    // contra loop aqui. Confirmado manualmente com duas abas reais: como este
    // próprio handler sempre resulta num novo `setData`, e o efeito de
    // persistência acima roda de novo sobre esse novo `data` (nova
    // referência, mesmo com conteúdo igual) e regrava no localStorage, a aba
    // que originou a mudança acaba recebendo um "eco" indireto (via a
    // gravação feita pelo efeito da OUTRA aba) — não é o mesmo evento
    // ricocheteando, é uma segunda gravação genuína. Isso converge sozinho em
    // uma rodada extra, porque o navegador só dispara "storage" quando o
    // valor serializado realmente muda; a segunda gravação (eco) escreve a
    // mesma string que já está lá, então não dispara um terceiro evento.
    //
    // Relemos via loadData() em vez de usar event.newValue diretamente: se
    // mais de uma gravação aconteceu entre o evento disparar e este handler
    // rodar, isso garante pegar o valor mais atual do localStorage, não um
    // instantâneo já obsoleto. loadData() também já trata newValue === null
    // (chave removida, ex: localStorage.clear() externo) devolvendo
    // emptyData, então não precisamos tratar esse caso separadamente aqui.
    //
    // Limitação conhecida e assumida (não resolvida aqui — merge de conflito
    // está fora de escopo): se a aba atual estiver no meio de uma mutação
    // (ex: editarVenda/removerVenda, que leem `data` do closure em vez de via
    // `prev` no updater) bem no momento em que esta sincronização substitui o
    // estado local, a checagem de segurança dessa mutação pode ter sido
    // decidida com base num `data` já desatualizado. Isso é uma janela de
    // corrida estreita e rara (não é o cenário comum de "formulário aberto",
    // que fica em estado local do componente e não é afetado por isto), mas
    // pode, em tese, levar a uma decisão de bloqueio/permissão incorreta
    // nesse instante específico.
    const handleStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      const userId = getAuthenticatedUserId();
      if (event.key !== null && event.key !== storageKeyForUser(userId)) return;
      setData(loadData(userId));
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const aplicarDadosDoBanco = (serverData: AppData) => {
    setData((prev) => mesclarDadosDoBanco(prev, serverData));
  };

  const setConfig = async (config: CompanyConfig) => {
    setData((prev) => ({ ...prev, config }));
    if (!activeUserIdRef.current) return;
    const response = await saveSettingsRequest(config);
    aplicarDadosDoBanco(response.data);
  };

  const addVenda = (venda: Omit<Venda, 'id'>, opts?: { clienteId?: string }) => {
    const novaVenda: Venda = { ...venda, createdAt: venda.createdAt ?? new Date().toISOString(), id: uid() };

    setData((prev) => {
      let produtos = prev.produtos;
      if (novaVenda.produtoId) {
        produtos = prev.produtos.map((p) =>
          p.id === novaVenda.produtoId && p.type === 'product'
            ? { ...p, quantidade: Math.max(0, (p.quantidade ?? 0) - novaVenda.quantidade) }
            : p,
        );
      }

      let contas = prev.contas;
      if (novaVenda.formaPagamento === 'fiado') {
        const contaFiado: Conta = {
          id: uid(),
          tipo: 'receber',
          descricao: novaVenda.descricao,
          valor: novaVenda.quantidade * novaVenda.valorUnitario,
          vencimento: novaVenda.data,
          quitado: false,
          origemVendaId: novaVenda.id,
          clienteId: opts?.clienteId,
        };
        contas = [...prev.contas, contaFiado];
      }

      return { ...prev, vendas: [...prev.vendas, novaVenda], produtos, contas };
    });
  };

  const editarVenda = (id: string, patch: Partial<Omit<Venda, 'id'>>): boolean => {
    const vendaAtual = data.vendas.find((v) => v.id === id);
    if (!vendaAtual) return false;

    const vendaAtualizada: Venda = {
      ...vendaAtual,
      ...patch,
      createdAt:
        patch.data && patch.data !== vendaAtual.data
          ? `${patch.data}T12:00:00.000Z`
          : vendaAtual.createdAt,
    };
    const saiuDoFiado = vendaAtual.formaPagamento === 'fiado' && vendaAtualizada.formaPagamento !== 'fiado';
    const contaVinculada = saiuDoFiado ? data.contas.find((c) => c.origemVendaId === id) : undefined;

    // não dá pra tirar a venda do fiado se a conta a receber gerada por ela já foi
    // paga de fato — isso apagaria um recebimento que já aconteceu
    if (contaVinculada?.quitado) return false;

    setData((prev) => {
      // estoque é afetado por qual produto a venda referencia e por quantidade —
      // valorUnitario e formaPagamento não têm efeito nenhum sobre o estoque
      let produtos = prev.produtos;
      const produtoIdMudou = patch.produtoId !== undefined && patch.produtoId !== vendaAtual.produtoId;

      if (produtoIdMudou) {
        if (vendaAtual.produtoId) {
          produtos = produtos.map((p) =>
            p.id === vendaAtual.produtoId && p.type === 'product'
              ? { ...p, quantidade: (p.quantidade ?? 0) + vendaAtual.quantidade }
              : p,
          );
        }
        if (vendaAtualizada.produtoId) {
          produtos = produtos.map((p) =>
            p.id === vendaAtualizada.produtoId && p.type === 'product'
              ? { ...p, quantidade: Math.max(0, (p.quantidade ?? 0) - vendaAtualizada.quantidade) }
              : p,
          );
        }
      } else if (patch.quantidade !== undefined && patch.quantidade !== vendaAtual.quantidade && vendaAtual.produtoId) {
        const delta = vendaAtualizada.quantidade - vendaAtual.quantidade;
        produtos = produtos.map((p) =>
          p.id === vendaAtual.produtoId && p.type === 'product'
            ? { ...p, quantidade: Math.max(0, (p.quantidade ?? 0) - delta) }
            : p,
        );
      }

      // saindo do fiado (e já confirmado acima que a conta não está quitada):
      // a dívida que essa venda gerou deixa de existir. Entrando no fiado a partir
      // de outra forma de pagamento não cria uma conta automaticamente aqui — isso
      // exigiria escolher um cliente, fora do escopo de uma correção de venda.
      let contas = prev.contas;
      if (contaVinculada) {
        contas = prev.contas.filter((c) => c.id !== contaVinculada.id);
      }

      return {
        ...prev,
        produtos,
        contas,
        vendas: prev.vendas.map((v) => (v.id === id ? vendaAtualizada : v)),
      };
    });

    return true;
  };

  const removerVenda = (id: string): boolean => {
    const venda = data.vendas.find((v) => v.id === id);
    if (!venda) return false;

    const contaVinculada = data.contas.find((c) => c.origemVendaId === id);
    if (contaVinculada?.quitado) return false;

    setData((prev) => ({
      ...prev,
      vendas: prev.vendas.filter((v) => v.id !== id),
      contas: contaVinculada ? prev.contas.filter((c) => c.id !== contaVinculada.id) : prev.contas,
    }));

    return true;
  };

  const addProduto = async (produto: Omit<Produto, 'id'>) => {
    if (!activeUserIdRef.current) {
      setData((prev) => ({
        ...prev,
        produtos: [...prev.produtos, { ...produto, id: uid(), createdAt: produto.createdAt ?? new Date().toISOString() }],
      }));
      return;
    }
    const response = await createProductRequest(produto);
    aplicarDadosDoBanco(response.data);
  };

  const atualizarProduto = async (id: string, patch: Partial<Omit<Produto, 'id'>>) => {
    if (!activeUserIdRef.current) {
      setData((prev) => ({ ...prev, produtos: prev.produtos.map((item) => item.id === id ? { ...item, ...patch } : item) }));
      return;
    }
    const response = await updateProductRequest(id, patch);
    aplicarDadosDoBanco(response.data);
  };

  const removerProduto = async (id: string) => {
    if (!activeUserIdRef.current) {
      setData((prev) => ({ ...prev, produtos: prev.produtos.filter((item) => item.id !== id) }));
      return;
    }
    const response = await deleteProductRequest(id);
    aplicarDadosDoBanco(response.data);
  };

  const addCategoria = async (nome: string): Promise<boolean> => {
    const nomeNormalizado = nome.trim();
    if (!nomeNormalizado) return false;
    const categorias = data.categorias ?? [];
    if (categorias.some((categoria) => categoria.nome.toLocaleLowerCase('pt-BR') === nomeNormalizado.toLocaleLowerCase('pt-BR'))) {
      return false;
    }
    if (!activeUserIdRef.current) {
      setData((prev) => ({ ...prev, categorias: [...(prev.categorias ?? []), { id: uid(), nome: nomeNormalizado }] }));
      return true;
    }
    const response = await createCategoryRequest(nomeNormalizado);
    aplicarDadosDoBanco(response.data);
    return true;
  };

  const editarCategoria = async (id: string, nome: string): Promise<boolean> => {
    const nomeNormalizado = nome.trim();
    const categorias = data.categorias ?? [];
    const categoriaAtual = categorias.find((categoria) => categoria.id === id);
    if (!categoriaAtual || !nomeNormalizado) return false;
    if (
      categorias.some(
        (categoria) =>
          categoria.id !== id &&
          categoria.nome.toLocaleLowerCase('pt-BR') === nomeNormalizado.toLocaleLowerCase('pt-BR'),
      )
    ) {
      return false;
    }

    if (!activeUserIdRef.current) {
      setData((prev) => ({
        ...prev,
        categorias: (prev.categorias ?? []).map((item) => item.id === id ? { ...item, nome: nomeNormalizado } : item),
        produtos: prev.produtos.map((produto) => produto.categoria === categoriaAtual.nome ? { ...produto, categoria: nomeNormalizado } : produto),
      }));
      return true;
    }

    const response = await updateCategoryRequest(id, nomeNormalizado);
    aplicarDadosDoBanco(response.data);
    return true;
  };

  const removerCategoria = async (id: string) => {
    const categoriaAtual = (data.categorias ?? []).find((categoria) => categoria.id === id);
    if (!categoriaAtual) return;
    if (!activeUserIdRef.current) {
      setData((prev) => ({
        ...prev,
        categorias: (prev.categorias ?? []).filter((item) => item.id !== id),
        produtos: prev.produtos.map((produto) => produto.categoria === categoriaAtual.nome ? { ...produto, categoria: undefined } : produto),
      }));
      return;
    }
    const response = await deleteCategoryRequest(id);
    aplicarDadosDoBanco(response.data);
  };

  const addConta = (conta: Omit<Conta, 'id' | 'quitado'>) => {
    setData((prev) => ({
      ...prev,
      contas: [...prev.contas, { ...conta, id: uid(), quitado: false }],
    }));
  };

  const editarConta = (id: string, patch: Partial<Omit<Conta, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      contas: prev.contas.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  };

  const removerConta = (id: string) => {
    setData((prev) => ({ ...prev, contas: prev.contas.filter((c) => c.id !== id) }));
  };

  const marcarContaQuitada = (id: string, dataPagamento?: string) => {
    const dataQuitacao = dataPagamento ?? todayISO();
    const quitadoEm = dataQuitacao === todayISO() ? new Date().toISOString() : `${dataQuitacao}T12:00:00.000Z`;
    setData((prev) => ({
      ...prev,
      contas: prev.contas.map((c) =>
        c.id === id ? { ...c, quitado: true, dataQuitacao, quitadoEm } : c,
      ),
    }));
  };

  const addLancamentoManual = (lancamento: Omit<LancamentoManual, 'id'>) => {
    setData((prev) => ({
      ...prev,
      lancamentosManuais: [
        ...prev.lancamentosManuais,
        { ...lancamento, createdAt: lancamento.createdAt ?? new Date().toISOString(), id: uid() },
      ],
    }));
  };

  const editarLancamentoManual = (id: string, patch: Partial<Omit<LancamentoManual, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      lancamentosManuais: prev.lancamentosManuais.map((l) =>
        l.id === id
          ? {
              ...l,
              ...patch,
              createdAt: patch.data && patch.data !== l.data ? `${patch.data}T12:00:00.000Z` : l.createdAt,
            }
          : l,
      ),
    }));
  };

  const removerLancamentoManual = (id: string) => {
    setData((prev) => ({
      ...prev,
      lancamentosManuais: prev.lancamentosManuais.filter((l) => l.id !== id),
    }));
  };

  const addCliente = (cliente: Omit<Cliente, 'id'>): Cliente => {
    const novoCliente: Cliente = { ...cliente, id: uid() };
    setData((prev) => ({ ...prev, clientes: [...prev.clientes, novoCliente] }));
    return novoCliente;
  };

  const editarCliente = (id: string, patch: Partial<Omit<Cliente, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      clientes: prev.clientes.map((cliente) => (cliente.id === id ? { ...cliente, ...patch } : cliente)),
    }));
  };

  const registrarVendaNoBanco = async (items: SaleItemInput[], forma: FormaPagamento, clienteId?: string) => {
    const response = await registerSaleRequest(items, forma, clienteId);
    aplicarDadosDoBanco(response.data);
  };

  const registrarLancamentoNoBanco: AppDataContextValue['registrarLancamentoNoBanco'] = async (input) => {
    const response = await registerTransactionRequest({
      type: input.tipo,
      description: input.descricao,
      amount: input.valor,
      paymentMethod: input.formaPagamento,
      entryKind: input.tipoEntrada,
      expenseKind: input.tipoDespesa,
      movementKind: input.movimentoCaixa,
    });
    aplicarDadosDoBanco(response.data);
  };

  const resolverPendenciaNoBanco: AppDataContextValue['resolverPendenciaNoBanco'] = async (
    id,
    classificacao,
    produtoId,
    quantidade,
    valorCorrigido,
  ) => {
    const response = await resolveTransactionIdentificationRequest(
      id,
      classificacao,
      produtoId,
      quantidade,
      valorCorrigido,
    );
    aplicarDadosDoBanco(response.data);
  };

  const cadastrarClienteNoBanco = async (cliente: Omit<Cliente, 'id'>): Promise<Cliente> => {
    const response = await registerCustomerRequest(cliente.nome, cliente.telefone);
    aplicarDadosDoBanco(response.data);
    return response.customer;
  };

  const baixarFiado = async (id: string, forma: Exclude<FormaPagamento, 'fiado'>) => {
    const response = await payCreditRequest(id, forma);
    aplicarDadosDoBanco(response.data);
  };

  const baixarDespesaFixa = async (id: string, forma: Exclude<FormaPagamento, 'fiado'>) => {
    const response = await payFixedExpenseRequest(id, forma);
    aplicarDadosDoBanco(response.data);
  };

  const cadastrarDespesaFixaNoBanco: AppDataContextValue['cadastrarDespesaFixaNoBanco'] = async (input) => {
    const response = await registerFixedExpenseRequest(
      input.nome,
      input.valor,
      input.recorrencia === 'semanal' ? 'weekly' : 'monthly',
    );
    aplicarDadosDoBanco(response.data);
  };

  const removerDespesaFixaNoBanco = async (id: string) => {
    const response = await deleteFixedExpenseRequest(id);
    aplicarDadosDoBanco(response.data);
  };

  const abrirCaixa = async (valorInicial: number, responsavel?: string) => {
    const response = await openCashSessionRequest(valorInicial, responsavel);
    aplicarDadosDoBanco(response.data);
  };

  const fecharCaixa = async (dinheiroContado: number, permitirPendencias = false) => {
    if (!data.caixaAtual) throw new Error('Nenhum caixa aberto.');
    const response = await closeCashSessionRequest(data.caixaAtual.id, dinheiroContado, permitirPendencias);
    aplicarDadosDoBanco(response.data);
  };

  const reabrirCaixa = async (id: string) => {
    const response = await reopenCashSessionRequest(id);
    aplicarDadosDoBanco(response.data);
  };

  const resetData = () => {
    setData({ ...emptyData });
  };

  const hoje = todayISO();
  const viewPeriod: ViewPeriod = data.config?.viewPeriod ?? 'day';

  const vendasHoje = useMemo(
    () => {
      const vendasRecebidas = data.vendas
        .filter((v) => v.data === hoje && v.formaPagamento !== 'fiado')
        .reduce((sum, v) => sum + v.quantidade * v.valorUnitario, 0);
      const fiadosRecebidos = data.contas
        .filter((c) => c.tipo === 'receber' && c.quitado && c.dataQuitacao === hoje)
        .reduce((sum, c) => sum + c.valor, 0);
      return vendasRecebidas + fiadosRecebidos;
    },
    [data.vendas, data.contas, hoje],
  );

  const contasQuitadasHoje = useMemo(
    () => data.contas.filter((c) => c.quitado && c.dataQuitacao === hoje),
    [data.contas, hoje],
  );

  const despesasHoje = useMemo(() => {
    const contasPagas = contasQuitadasHoje
      .filter((c) => c.tipo === 'pagar')
      .reduce((sum, c) => sum + c.valor, 0);
    const lancamentosSaida = data.lancamentosManuais
      .filter((l) => l.tipo === 'saida' && l.data === hoje)
      .reduce((sum, l) => sum + l.valor, 0);
    const despesasFixasPagas = (data.config?.despesasFixas ?? [])
      .filter((despesa) => despesa.quitado && dataLocalISO(despesa.pagoEm) === hoje)
      .reduce((sum, despesa) => sum + despesa.valor, 0);
    return contasPagas + lancamentosSaida + despesasFixasPagas;
  }, [contasQuitadasHoje, data.config?.despesasFixas, data.lancamentosManuais, hoje]);

  const lucroEstimadoHoje = useMemo(() => {
    const vendasFiadoRecebidasHoje = new Set(
      data.contas
        .filter((c) => c.tipo === 'receber' && c.quitado && c.dataQuitacao === hoje && c.origemVendaId)
        .map((c) => c.origemVendaId),
    );
    return data.vendas
      .filter(
        (v) =>
          v.produtoId &&
          ((v.data === hoje && v.formaPagamento !== 'fiado') || vendasFiadoRecebidasHoje.has(v.id)),
      )
      .reduce((sum, v) => {
        const produto = data.produtos.find((p) => p.id === v.produtoId);
        if (!produto || produto.custo === undefined) return sum;
        return sum + (v.valorUnitario - produto.custo) * v.quantidade;
      }, 0);
  }, [data.vendas, data.produtos, data.contas, hoje]);

  const resumoPeriodo = useMemo<ResumoPeriodo>(() => {
    const dias = viewPeriod === 'day' ? [hoje] : ultimosNDias(hoje, 7);
    const diasSet = new Set(dias);

    const vendas = data.vendas
      .filter((v) => v.formaPagamento !== 'fiado' && diasSet.has(v.data))
      .reduce((sum, v) => sum + v.quantidade * v.valorUnitario, 0);

    const recebimentos = data.contas
      .filter((c) => c.tipo === 'receber' && c.quitado && c.dataQuitacao && diasSet.has(c.dataQuitacao))
      .reduce((sum, c) => sum + c.valor, 0);

    const contasPagas = data.contas
      .filter((c) => c.tipo === 'pagar' && c.quitado && c.dataQuitacao && diasSet.has(c.dataQuitacao))
      .reduce((sum, c) => sum + c.valor, 0);
    const lancamentosSaida = data.lancamentosManuais
      .filter((l) => l.tipo === 'saida' && diasSet.has(l.data))
      .reduce((sum, l) => sum + l.valor, 0);
    const despesasFixasPagas = (data.config?.despesasFixas ?? [])
      .filter((despesa) => {
        const diaPagamento = dataLocalISO(despesa.pagoEm);
        return despesa.quitado && diaPagamento !== undefined && diasSet.has(diaPagamento);
      })
      .reduce((sum, despesa) => sum + despesa.valor, 0);

    return { vendas: vendas + recebimentos, despesas: contasPagas + lancamentosSaida + despesasFixasPagas };
  }, [data.vendas, data.contas, data.config?.despesasFixas, data.lancamentosManuais, viewPeriod, hoje]);

  const vendasUltimos7Dias = useMemo(() => {
    const dias = ultimosNDias(hoje, 7);
    return dias.map((data_) => ({
      data: data_,
      total: data.vendas
        .filter((v) => v.data === data_ && v.formaPagamento !== 'fiado')
        .reduce((sum, v) => sum + v.quantidade * v.valorUnitario, 0) +
        data.contas
          .filter((c) => c.tipo === 'receber' && c.quitado && c.dataQuitacao === data_)
          .reduce((sum, c) => sum + c.valor, 0),
    }));
  }, [data.vendas, data.contas, hoje]);

  const saldoCaixa = useMemo(() => {
    const entradasVendas = data.vendas
      .filter((v) => v.formaPagamento !== 'fiado')
      .reduce((sum, v) => sum + v.quantidade * v.valorUnitario, 0);
    const entradasContasRecebidas = data.contas
      .filter((c) => c.tipo === 'receber' && c.quitado)
      .reduce((sum, c) => sum + c.valor, 0);
    const saidasContasPagas = data.contas
      .filter((c) => c.tipo === 'pagar' && c.quitado)
      .reduce((sum, c) => sum + c.valor, 0);
    const entradasManuais = data.lancamentosManuais
      .filter((l) => l.tipo === 'entrada')
      .reduce((sum, l) => sum + l.valor, 0);
    const saidasManuais = data.lancamentosManuais
      .filter((l) => l.tipo === 'saida')
      .reduce((sum, l) => sum + l.valor, 0);
    const saidasFixas = (data.config?.despesasFixas ?? [])
      .filter((despesa) => despesa.quitado)
      .reduce((sum, despesa) => sum + despesa.valor, 0);

    return (
      entradasVendas +
      entradasContasRecebidas +
      entradasManuais -
      saidasContasPagas -
      saidasManuais -
      saidasFixas
    );
  }, [data.vendas, data.contas, data.config?.despesasFixas, data.lancamentosManuais]);

  const contasAPagarHoje = useMemo(
    () => data.contas.filter((c) => c.tipo === 'pagar' && !c.quitado && c.vencimento === hoje),
    [data.contas, hoje],
  );

  const contasAReceberEmAberto = useMemo(
    () => data.contas.filter((c) => c.tipo === 'receber' && !c.quitado),
    [data.contas],
  );

  // considera tanto contas a pagar quanto a receber (fiado) — um recebimento
  // atrasado merece o mesmo alerta que uma conta a pagar atrasada
  const contasVencendoEmBreve = useMemo(
    () =>
      data.contas.filter((c) => {
        if (c.quitado) return false;
        const dias = diffDias(hoje, c.vencimento);
        return dias > 0 && dias <= 3;
      }),
    [data.contas, hoje],
  );

  const contasVencidas = useMemo(
    () =>
      data.contas.filter((c) => {
        if (c.quitado) return false;
        return diffDias(hoje, c.vencimento) < 0;
      }),
    [data.contas, hoje],
  );

  const produtosEstoqueBaixo = useMemo(
    () => data.produtos.filter((p) => p.type === 'product' && (p.quantidade ?? 0) <= (p.quantidadeMinima ?? 0)),
    [data.produtos],
  );

  const totalNotificacoes = produtosEstoqueBaixo.length + contasVencendoEmBreve.length + contasVencidas.length;

  const value: AppDataContextValue = {
    data,
    loadedUserId,
    setConfig,
    addVenda,
    editarVenda,
    removerVenda,
    addProduto,
    atualizarProduto,
    removerProduto,
    addCategoria,
    editarCategoria,
    removerCategoria,
    addConta,
    editarConta,
    removerConta,
    marcarContaQuitada,
    addLancamentoManual,
    editarLancamentoManual,
    removerLancamentoManual,
    addCliente,
    editarCliente,
    registrarVendaNoBanco,
    registrarLancamentoNoBanco,
    resolverPendenciaNoBanco,
    cadastrarClienteNoBanco,
    baixarFiado,
    baixarDespesaFixa,
    cadastrarDespesaFixaNoBanco,
    removerDespesaFixaNoBanco,
    abrirCaixa,
    fecharCaixa,
    reabrirCaixa,
    resetData,
    saldoCaixa,
    vendasHoje,
    despesasHoje,
    lucroEstimadoHoje,
    resumoPeriodo,
    vendasUltimos7Dias,
    contasAPagarHoje,
    contasAReceberEmAberto,
    contasVencendoEmBreve,
    contasVencidas,
    contasQuitadasHoje,
    produtosEstoqueBaixo,
    totalNotificacoes,
  };

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- padrão usual de Context: exportar o hook de consumo junto do Provider custa apenas fast refresh completo neste arquivo, não é um bug
export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData deve ser usado dentro de AppDataProvider');
  return ctx;
}
