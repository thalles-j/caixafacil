import type { Produto } from '../types';

export type OrdenacaoCatalogo =
  | 'recentes'
  | 'maior-preco'
  | 'menor-preco'
  | 'az'
  | 'za'
  | 'mais-vendidos'
  | 'menos-vendidos';

const compararNome = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function sortCatalogItems(
  items: readonly Produto[],
  sort: OrdenacaoCatalogo,
  soldByProduct: ReadonlyMap<string, number> = new Map(),
): Produto[] {
  const originalOrder = new Map(items.map((item, index) => [item.id, index]));
  const soldQuantity = (item: Produto) => item.quantidadeVendida ?? soldByProduct.get(item.id) ?? 0;

  return [...items].sort((a, b) => {
    let result = 0;
    if (sort === 'maior-preco') result = b.precoVenda - a.precoVenda;
    if (sort === 'menor-preco') result = a.precoVenda - b.precoVenda;
    if (sort === 'az') result = compararNome.compare(a.nome, b.nome);
    if (sort === 'za') result = compararNome.compare(b.nome, a.nome);
    if (sort === 'mais-vendidos') result = soldQuantity(b) - soldQuantity(a);
    if (sort === 'menos-vendidos') result = soldQuantity(a) - soldQuantity(b);
    if (sort === 'recentes') {
      const dateA = a.createdAt ? Date.parse(a.createdAt) : Number.NaN;
      const dateB = b.createdAt ? Date.parse(b.createdAt) : Number.NaN;
      if (Number.isFinite(dateA) && Number.isFinite(dateB)) result = dateB - dateA;
      if (!result) result = (originalOrder.get(b.id) ?? 0) - (originalOrder.get(a.id) ?? 0);
    }
    return result || compararNome.compare(a.nome, b.nome);
  });
}
