import { useMemo, useState, type FormEvent } from 'react';
import { ArrowsDownUp, MagnifyingGlass, Package, Plus, WarningCircle, Wrench, Tag, PencilSimple, Trash } from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { formatCurrency, parseMoney, sanitizeIntegerInput, sanitizeMoneyInput } from '../lib/format';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import { paginateItems } from '../lib/pagination';
import { sortCatalogItems, type OrdenacaoCatalogo } from '../lib/catalogSorting';
import { catalogTypesForOffer, defaultCatalogType } from '../lib/offering';
import type { CategoriaProduto, Produto } from '../types';

type TipoFiltro = 'todos' | 'product' | 'service';
type Filtro = 'todos' | 'baixo' | string;
const OPCOES_ORDENACAO: ReadonlyArray<{ valor: OrdenacaoCatalogo; label: string }> = [
  { valor: 'recentes', label: 'Adicionados recentemente' },
  { valor: 'maior-preco', label: 'Maior preço' },
  { valor: 'menor-preco', label: 'Menor preço' },
  { valor: 'az', label: 'Ordem alfabética A–Z' },
  { valor: 'za', label: 'Ordem alfabética Z–A' },
  { valor: 'mais-vendidos', label: 'Mais vendidos' },
  { valor: 'menos-vendidos', label: 'Menos vendidos' },
];

function obterTipoItem(item: Produto): 'product' | 'service' {
  const tipoPersistido = (item as Produto & { type?: unknown }).type;
  if (tipoPersistido === 'product' || tipoPersistido === 'service') return tipoPersistido;
  return item.duracao ? 'service' : 'product';
}

export default function Catalogo() {
  const {
    data,
    addProduto,
    atualizarProduto,
    removerProduto,
    addCategoria,
    editarCategoria,
    removerCategoria,
  } = useAppData();
  const oferta = data.config?.oferta ?? 'ambos';
  const tiposPermitidos = useMemo(() => catalogTypesForOffer(oferta), [oferta]);
  const tipoPadrao = defaultCatalogType(oferta);
  const permiteTrocarTipo = tiposPermitidos.length > 1;
  const tiposFiltroDisponiveis: TipoFiltro[] = ['todos', ...tiposPermitidos];

  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busca, setBusca] = useState('');
  const [modalAberto, setModalAberto] = useState(false);
  const [confirmarRemocaoAberto, setConfirmarRemocaoAberto] = useState(false);
  const [produtoEditando, setProdutoEditando] = useState<Produto | null>(null);
  const [itemType, setItemType] = useState<'product' | 'service'>(tipoPadrao);
  const [produtoParaRemover, setProdutoParaRemover] = useState<Produto | null>(null);
  const [categoriasModalAberto, setCategoriasModalAberto] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [categoriaEditando, setCategoriaEditando] = useState<CategoriaProduto | null>(null);
  const [nomeCategoriaEditando, setNomeCategoriaEditando] = useState('');
  const [categoriaParaRemover, setCategoriaParaRemover] = useState<CategoriaProduto | null>(null);
  const [categoriaErro, setCategoriaErro] = useState<string | null>(null);
  const [catalogoErro, setCatalogoErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [ordenacao, setOrdenacao] = useState<OrdenacaoCatalogo>('recentes');
  const itemTypeEfetivo = tiposPermitidos.includes(itemType) ? itemType : tipoPadrao;
  const tipoFiltroEfetivo = tipoFiltro === 'todos' || tiposPermitidos.includes(tipoFiltro) ? tipoFiltro : 'todos';
  const filtroEfetivo = filtro === 'baixo' && !tiposPermitidos.includes('product') ? 'todos' : filtro;

  const categorias = data.categorias ?? [];

  const vendasPorProduto = useMemo(() => {
    const totais = new Map<string, number>();
    data.vendas.forEach((venda) => {
      if (!venda.produtoId) return;
      totais.set(venda.produtoId, (totais.get(venda.produtoId) ?? 0) + venda.quantidade);
    });
    return totais;
  }, [data.vendas]);

  const itensPermitidos = useMemo(
    () => data.produtos.filter((item) => catalogTypesForOffer(oferta).includes(obterTipoItem(item))),
    [data.produtos, oferta],
  );

  const itensFiltrados = useMemo(() => {
    const filtrados = itensPermitidos.filter((item) => {
      const tipoItem = obterTipoItem(item);
      if (tipoFiltroEfetivo === 'product' && tipoItem !== 'product') return false;
      if (tipoFiltroEfetivo === 'service' && tipoItem !== 'service') return false;
      if (filtroEfetivo === 'baixo') {
        return tipoItem === 'product' && (item.quantidade ?? 0) <= (item.quantidadeMinima ?? 0);
      }
      if (filtroEfetivo !== 'todos' && item.categoria !== filtroEfetivo) return false;
      if (!busca.trim()) return true;
      return item.nome.toLowerCase().includes(busca.trim().toLowerCase());
    });

    return sortCatalogItems(filtrados, ordenacao, vendasPorProduto);
  }, [busca, filtroEfetivo, itensPermitidos, ordenacao, tipoFiltroEfetivo, vendasPorProduto]);
  const itensPaginados = paginateItems(itensFiltrados, pagina);

  const abrirNovo = () => {
    setProdutoEditando(null);
    setItemType(tipoPadrao);
    setCatalogoErro(null);
    setConfirmarRemocaoAberto(false);
    setModalAberto(true);
  };

  const abrirEdicao = (produto: Produto) => {
    setProdutoEditando(produto);
    setItemType(obterTipoItem(produto));
    setCatalogoErro(null);
    setConfirmarRemocaoAberto(false);
    setModalAberto(true);
  };

  const abrirConfirmarRemocao = (produto: Produto) => {
    setProdutoParaRemover(produto);
    setConfirmarRemocaoAberto(true);
  };

  const fecharConfirmarRemocao = () => {
    setProdutoParaRemover(null);
    setConfirmarRemocaoAberto(false);
  };

  const confirmarRemocao = async () => {
    if (!produtoParaRemover) return;
    setSalvando(true);
    try {
      await removerProduto(produtoParaRemover.id);
      fecharConfirmarRemocao();
    } catch (error) {
      setCatalogoErro(error instanceof Error ? error.message : 'Não foi possível excluir o item.');
    } finally {
      setSalvando(false);
    }
  };

  const cadastrarCategoria = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSalvando(true);
    try {
      if (!(await addCategoria(novaCategoria))) {
        setCategoriaErro('Informe um nome diferente das categorias existentes.');
        return;
      }
      setNovaCategoria('');
      setCategoriaErro(null);
    } catch (error) {
      setCategoriaErro(error instanceof Error ? error.message : 'Não foi possível criar a categoria.');
    } finally {
      setSalvando(false);
    }
  };

  const iniciarEdicaoCategoria = (categoria: CategoriaProduto) => {
    setCategoriaEditando(categoria);
    setNomeCategoriaEditando(categoria.nome);
    setCategoriaErro(null);
  };

  const salvarEdicaoCategoria = async () => {
    if (!categoriaEditando) return;
    const nomeAnterior = categoriaEditando.nome;
    setSalvando(true);
    try {
      if (!(await editarCategoria(categoriaEditando.id, nomeCategoriaEditando))) {
        setCategoriaErro('Informe um nome diferente das categorias existentes.');
        return;
      }
      if (filtro === nomeAnterior) setFiltro(nomeCategoriaEditando.trim());
      setCategoriaEditando(null);
      setNomeCategoriaEditando('');
      setCategoriaErro(null);
    } catch (error) {
      setCategoriaErro(error instanceof Error ? error.message : 'Não foi possível atualizar a categoria.');
    } finally {
      setSalvando(false);
    }
  };

  const confirmarRemocaoCategoria = async () => {
    if (!categoriaParaRemover) return;
    setSalvando(true);
    try {
      await removerCategoria(categoriaParaRemover.id);
      if (filtro === categoriaParaRemover.nome) setFiltro('todos');
      setCategoriaParaRemover(null);
    } catch (error) {
      setCategoriaErro(error instanceof Error ? error.message : 'Não foi possível excluir a categoria.');
    } finally {
      setSalvando(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const nome = String(form.get('nome') ?? '').trim();
    const precoVenda = parseMoney(String(form.get('precoVenda') ?? '0'));
    const custoRaw = String(form.get('custo') ?? '').trim();
    const custo = custoRaw ? parseMoney(custoRaw) : undefined;
    const categoriaRaw = String(form.get('categoria') ?? '').trim();
    const categoria = categoriaRaw || undefined;
    const codigoBarras = String(form.get('codigoBarras') ?? '').trim() || undefined;

    if (!nome || precoVenda <= 0) {
      setCatalogoErro('Informe um nome e um preço de venda válido.');
      return;
    }

    setSalvando(true);
    setCatalogoErro(null);
    try {
      if (itemTypeEfetivo === 'product') {
      const quantidade = Math.max(0, Number(form.get('quantidade') ?? 0));
      const quantidadeMinima = Math.max(0, Number(form.get('quantidadeMinima') ?? 0));
      const payload: Omit<Produto, 'id'> = {
        type: 'product',
        nome,
        precoVenda,
        categoria,
        codigoBarras,
        custo,
        quantidade,
        quantidadeMinima,
      };

      if (produtoEditando) {
        await atualizarProduto(produtoEditando.id, payload);
      } else {
        await addProduto(payload);
      }
      } else {
      const duracao = String(form.get('duracao') ?? '').trim();
      if (!duracao) {
        setCatalogoErro('Informe a duração estimada do serviço.');
        return;
      }
      const payload: Omit<Produto, 'id'> = {
        type: 'service',
        nome,
        precoVenda,
        categoria,
        custo,
        duracao,
      };

      if (produtoEditando) {
        await atualizarProduto(produtoEditando.id, payload);
      } else {
        await addProduto(payload);
      }
      }

      setModalAberto(false);
      setProdutoEditando(null);
    } catch (error) {
      setCatalogoErro(error instanceof Error ? error.message : 'Não foi possível salvar o item.');
    } finally {
      setSalvando(false);
    }
  };

  const quantidadeBaixa = (item: Produto) => {
    return obterTipoItem(item) === 'product' && (item.quantidade ?? 0) <= (item.quantidadeMinima ?? 0);
  };

  return (
    <div className="fade-in">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold">Catálogo</h2>
          <p className="truncate text-sm text-ink-soft">Gerencie produtos e serviços com o mesmo visual do app.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => {
              setCategoriasModalAberto(true);
              setCategoriaErro(null);
            }}
            className="flex items-center gap-2 rounded-lg border border-line bg-paper-raised px-3 py-1.5 text-sm font-medium text-ink-soft transition hover:border-ledger/30 hover:text-ink"
          >
            <Tag size={16} /> Categorias
          </button>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 rounded-lg bg-ledger/10 px-3 py-1.5 text-sm font-medium text-ledger-strong transition hover:bg-ledger/20 dark:text-ledger"
          >
            <Plus size={16} /> Novo
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="relative">
          <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            value={busca}
            onChange={(event) => {
              setBusca(event.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por nome..."
            className="w-full rounded-2xl border border-line bg-paper-raised px-10 py-3 text-sm text-ink shadow-sm focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
          />
        </div>
        <label className="flex min-w-0 items-center gap-2 rounded-xl border border-line bg-paper-raised px-3 py-2 text-ink shadow-sm">
          <ArrowsDownUp size={17} className="shrink-0 text-ink-soft" />
          <span className="sr-only">Ordenar catálogo</span>
          <select
            value={ordenacao}
            onChange={(event) => {
              setOrdenacao(event.target.value as OrdenacaoCatalogo);
              setPagina(1);
            }}
            aria-label="Ordenar catálogo"
            className="catalog-sort-select min-w-0 flex-1 cursor-pointer bg-transparent text-sm font-semibold text-ink outline-none"
          >
            {OPCOES_ORDENACAO.map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>{opcao.label}</option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          {tiposFiltroDisponiveis.map((tipo) => (
            <button
              key={tipo}
              onClick={() => {
                setTipoFiltro(tipo);
                setPagina(1);
              }}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                tipoFiltroEfetivo === tipo ? 'bg-ledger text-paper' : 'border border-line bg-paper-raised text-ink-soft'
              }`}
            >
              {tipo === 'todos' ? 'Todos' : tipo === 'product' ? 'Produtos' : 'Serviços'}
            </button>
          ))}
        </div>
      </div>

      <div className="scrollbar-hide mb-4 -mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        <button
          onClick={() => {
            setFiltro('todos');
            setPagina(1);
          }}
          className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
            filtroEfetivo === 'todos' ? 'bg-ledger text-paper' : 'border border-line bg-paper-raised text-ink-soft'
          }`}
        >
          Todos
        </button>
        {tiposPermitidos.includes('product') && (
          <button
            onClick={() => {
              setFiltro('baixo');
              setPagina(1);
            }}
            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filtroEfetivo === 'baixo' ? 'bg-stamp text-paper' : 'border border-line bg-paper-raised text-ink-soft'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current" /> Estoque baixo
          </button>
        )}
        {categorias.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setFiltro(cat.nome);
              setPagina(1);
            }}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition ${
              filtroEfetivo === cat.nome ? 'bg-ledger text-paper' : 'border border-line bg-paper-raised text-ink-soft'
            }`}
          >
            {cat.nome}
          </button>
        ))}
      </div>

      {itensFiltrados.length === 0 ? (
        itensPermitidos.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-line bg-paper-raised p-8 text-center shadow-sm">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-ledger/10 text-ledger-strong dark:text-ledger">
              <Package size={24} />
            </div>
            <p className="mb-1 text-sm font-medium text-ink">
              Nenhum {oferta === 'servicos' ? 'serviço' : oferta === 'produtos' ? 'produto' : 'item'} cadastrado ainda.
            </p>
            <p className="mb-4 text-xs text-ink-soft">
              Cadastre {oferta === 'servicos' ? 'serviços' : oferta === 'produtos' ? 'produtos' : 'produtos ou serviços'} para começar.
            </p>
            <button
              onClick={abrirNovo}
              className="flex items-center gap-2 rounded-lg bg-ledger px-4 py-2 text-sm font-medium text-paper transition hover:bg-ledger-strong"
            >
              <Plus size={16} /> Cadastrar item
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-paper-raised p-8 text-center text-ink-soft shadow-sm">
            <p className="text-sm font-medium">Nenhum item encontrado.</p>
            <p className="text-xs">Tente outro filtro ou palavra-chave.</p>
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {itensPaginados.items.map((item) => {
            const baixo = quantidadeBaixa(item);
            const tipoItem = obterTipoItem(item);
            return (
              <div
                key={item.id}
                className={`flex min-w-0 flex-col justify-between gap-4 rounded-2xl border bg-paper-raised p-4 shadow-sm ${
                  baixo ? 'border-stamp/40' : 'border-line'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-line/40 text-ledger-strong dark:text-ledger">
                    {tipoItem === 'product' ? <Package size={22} /> : <Wrench size={22} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{item.nome}</h3>
                      {item.categoria && (
                        <span className="shrink-0 rounded-full bg-line/50 px-2 py-0.5 text-[11px] font-semibold uppercase text-ink-soft">
                          {item.categoria}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 truncate font-ledger text-sm text-ink-soft">
                      {formatCurrency(item.precoVenda)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {tipoItem === 'product' ? (
                    <span className={`stamp ${baixo ? 'text-stamp' : 'text-ink-soft'}`}>
                      {item.quantidade ?? 0} em estoque
                    </span>
                  ) : (
                    <span className="stamp text-ledger-strong dark:text-ledger">
                      {item.duracao ?? '—'}
                    </span>
                  )}
                  {baixo && (
                    <span className="stamp text-stamp">
                      <WarningCircle size={12} weight="fill" /> baixo
                    </span>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => abrirEdicao(item)}
                    className="flex-1 rounded-full border border-ledger/30 bg-ledger/10 px-4 py-2 text-xs font-semibold text-ledger-strong transition hover:bg-ledger/20 dark:text-ledger"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => abrirConfirmarRemocao(item)}
                    className="flex-1 rounded-full border border-stamp/30 bg-stamp/10 px-4 py-2 text-xs font-semibold text-stamp transition hover:bg-stamp/20"
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={itensPaginados.currentPage}
        totalItems={itensFiltrados.length}
        onPageChange={setPagina}
        itemLabel="itens"
      />

      <Modal open={modalAberto} onClose={() => setModalAberto(false)} title={produtoEditando ? 'Editar item' : 'Novo item'}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Tipo</label>
            {permiteTrocarTipo ? (
              <div
                data-selected={itemTypeEfetivo}
                data-choice-position={itemTypeEfetivo === 'service' ? 'second' : 'first'}
                className="segmented-slider segmented-slider-2 catalog-type-selector grid grid-cols-2 rounded-xl border border-line bg-line/40 p-1"
              >
                <button
                  type="button"
                  onClick={() => setItemType('product')}
                  aria-pressed={itemTypeEfetivo === 'product'}
                  className={`selection-option rounded-lg border-0 px-4 py-3 text-sm font-semibold ${
                    itemTypeEfetivo === 'product'
                      ? 'bg-ledger text-paper shadow-sm'
                      : 'bg-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  Produto
                </button>
                <button
                  type="button"
                  onClick={() => setItemType('service')}
                  aria-pressed={itemTypeEfetivo === 'service'}
                  className={`selection-option rounded-lg border-0 px-4 py-3 text-sm font-semibold ${
                    itemTypeEfetivo === 'service'
                      ? 'bg-brass text-paper shadow-sm'
                      : 'bg-transparent text-ink-soft hover:text-ink'
                  }`}
                >
                  Serviço
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl border border-line bg-line/40 px-4 py-3 text-sm font-semibold text-ink">
                {tipoPadrao === 'product' ? <Package size={17} /> : <Wrench size={17} />}
                {tipoPadrao === 'product' ? 'Produto' : 'Serviço'}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Nome</label>
            <input
              name="nome"
              type="text"
              defaultValue={produtoEditando?.nome}
              placeholder="Ex: Refrigerante / Corte de Cabelo"
              className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Categoria (opcional)</label>
              <select
                name="categoria"
                defaultValue={produtoEditando?.categoria}
                className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
              >
                <option value="">Sem categoria</option>
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.nome}>
                    {categoria.nome}
                  </option>
                ))}
              </select>
              {categorias.length === 0 && (
                <button
                  type="button"
                  onClick={() => setCategoriasModalAberto(true)}
                  className="mt-1 text-xs font-medium text-ledger-strong hover:underline dark:text-ledger"
                >
                  Criar uma categoria
                </button>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Preço de Venda</label>
              <input
                name="precoVenda"
                type="text"
                inputMode="decimal"
                onInput={(e) => {
                  e.currentTarget.value = sanitizeMoneyInput(e.currentTarget.value);
                }}
                defaultValue={produtoEditando?.precoVenda}
                placeholder="Ex: 25,00"
                className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
                required
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Custo (opcional)</label>
            <input
              name="custo"
              type="text"
              inputMode="decimal"
              onInput={(e) => {
                e.currentTarget.value = sanitizeMoneyInput(e.currentTarget.value);
              }}
              defaultValue={produtoEditando?.custo}
              placeholder="Ex: 12,00"
              className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>

          {itemTypeEfetivo === 'product' ? (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Código de barras (opcional)</label>
                <input
                  name="codigoBarras"
                  type="text"
                  inputMode="numeric"
                  defaultValue={produtoEditando?.codigoBarras}
                  maxLength={64}
                  placeholder="Digite ou use um leitor USB/Bluetooth"
                  className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Quantidade</label>
                <input
                  name="quantidade"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onInput={(e) => {
                    e.currentTarget.value = sanitizeIntegerInput(e.currentTarget.value);
                  }}
                  defaultValue={produtoEditando?.quantidade ?? 0}
                  className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-soft">Estoque mínimo</label>
                <input
                  name="quantidadeMinima"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  onInput={(e) => {
                    e.currentTarget.value = sanitizeIntegerInput(e.currentTarget.value);
                  }}
                  defaultValue={produtoEditando?.quantidadeMinima ?? 0}
                  className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
                />
              </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Duração estimada</label>
              <input
                name="duracao"
                type="text"
                defaultValue={produtoEditando?.duracao}
                placeholder="Ex: 30 min"
                className="w-full rounded-lg border border-line bg-paper p-2 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
                required
              />
            </div>
          )}

          {catalogoErro && <p role="alert" className="text-xs font-medium text-stamp">{catalogoErro}</p>}
          <button disabled={salvando} type="submit" className="w-full rounded-lg bg-ledger px-4 py-2 text-sm font-semibold text-paper transition hover:bg-ledger-strong disabled:cursor-wait disabled:opacity-60">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </form>
      </Modal>

      <Modal
        open={categoriasModalAberto}
        onClose={() => {
          setCategoriasModalAberto(false);
          setCategoriaEditando(null);
          setCategoriaErro(null);
        }}
        title="Gerenciar categorias"
      >
        <div className="space-y-4">
          <form onSubmit={cadastrarCategoria} className="flex gap-2">
            <input
              value={novaCategoria}
              onChange={(event) => setNovaCategoria(event.target.value)}
              required
              maxLength={60}
              placeholder="Ex: Bebidas"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
            <button
              type="submit"
              disabled={salvando}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-ledger px-3 py-2 text-sm font-semibold text-paper transition hover:bg-ledger-strong"
            >
              <Plus size={16} /> Criar
            </button>
          </form>

          {categoriaErro && <p className="text-xs font-medium text-stamp">{categoriaErro}</p>}

          <div className="overflow-hidden rounded-xl border border-line">
            {categorias.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <Tag size={28} className="mx-auto mb-2 text-ink-soft" />
                <p className="text-sm font-medium text-ink">Nenhuma categoria criada</p>
                <p className="mt-1 text-xs text-ink-soft">Crie uma categoria para organizar seus produtos.</p>
              </div>
            ) : (
              <ul className="max-h-72 divide-y divide-line overflow-y-auto">
                {categorias.map((categoria) => (
                  <li key={categoria.id} className="p-3">
                    {categoriaEditando?.id === categoria.id ? (
                      <div className="flex gap-2">
                        <input
                          value={nomeCategoriaEditando}
                          onChange={(event) => setNomeCategoriaEditando(event.target.value)}
                          maxLength={60}
                          autoFocus
                          className="min-w-0 flex-1 rounded-lg border border-ledger bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/20"
                        />
                        <button
                          type="button"
                          onClick={() => void salvarEdicaoCategoria()}
                          disabled={salvando}
                          className="rounded-lg bg-ledger px-3 py-2 text-xs font-bold text-paper"
                        >
                          Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setCategoriaEditando(null)}
                          className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-ink"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2">
                          <Tag size={17} className="shrink-0 text-ledger-strong dark:text-ledger" />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">{categoria.nome}</p>
                            <p className="text-[11px] text-ink-soft">
                              {data.produtos.filter((produto) => produto.categoria === categoria.nome).length} item(ns)
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => iniciarEdicaoCategoria(categoria)}
                            aria-label={`Editar categoria ${categoria.nome}`}
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-line/40 hover:text-ink"
                          >
                            <PencilSimple size={16} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setCategoriaParaRemover(categoria)}
                            aria-label={`Excluir categoria ${categoria.nome}`}
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-stamp/10 hover:text-stamp"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={categoriaParaRemover !== null}
        onClose={() => setCategoriaParaRemover(null)}
        title="Excluir categoria?"
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Deseja excluir a categoria{' '}
            <span className="font-semibold text-ink">{categoriaParaRemover?.nome}</span>?
          </p>
          <p className="rounded-lg bg-brass/10 p-3 text-xs text-brass">
            Os produtos não serão excluídos; eles ficarão sem categoria.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCategoriaParaRemover(null)}
              className="flex-1 rounded-lg border border-line bg-paper px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-line/30"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void confirmarRemocaoCategoria()}
              disabled={salvando}
              className="flex-1 rounded-lg bg-stamp px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-stamp/90"
            >
              Excluir categoria
            </button>
          </div>
        </div>
      </Modal>

      <Modal open={confirmarRemocaoAberto} onClose={fecharConfirmarRemocao} title="Confirmar exclusão">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Tem certeza que deseja remover <span className="font-semibold text-ink">{produtoParaRemover?.nome}</span> do
            catálogo? Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-3">
            <button
              onClick={fecharConfirmarRemocao}
              className="flex-1 rounded-lg border border-line bg-paper px-4 py-2 text-sm font-medium text-ink transition hover:bg-line/30"
            >
              Cancelar
            </button>
            <button
              onClick={() => void confirmarRemocao()}
              disabled={salvando}
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
