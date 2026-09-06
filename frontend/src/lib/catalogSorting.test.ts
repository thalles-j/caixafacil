import { describe, expect, it } from 'vitest';
import type { Produto } from '../types';
import { sortCatalogItems } from './catalogSorting';

const items: Produto[] = [
  { id: 'b', type: 'product', nome: 'Banana', precoVenda: 8, createdAt: '2026-01-02T10:00:00Z', quantidadeVendida: 4 },
  { id: 'a', type: 'product', nome: 'Água', precoVenda: 3, createdAt: '2026-03-02T10:00:00Z', quantidadeVendida: 12 },
  { id: 'c', type: 'service', nome: 'Entrega', precoVenda: 15, createdAt: '2026-02-02T10:00:00Z', quantidadeVendida: 1 },
];

describe('ordenação do catálogo', () => {
  it('começa pelos itens adicionados recentemente', () => {
    expect(sortCatalogItems(items, 'recentes').map((item) => item.id)).toEqual(['a', 'c', 'b']);
  });

  it('ordena por maior e menor preço', () => {
    expect(sortCatalogItems(items, 'maior-preco').map((item) => item.id)).toEqual(['c', 'b', 'a']);
    expect(sortCatalogItems(items, 'menor-preco').map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('ordena alfabeticamente nos dois sentidos', () => {
    expect(sortCatalogItems(items, 'az').map((item) => item.nome)).toEqual(['Água', 'Banana', 'Entrega']);
    expect(sortCatalogItems(items, 'za').map((item) => item.nome)).toEqual(['Entrega', 'Banana', 'Água']);
  });

  it('ordena pelos totais vendidos', () => {
    expect(sortCatalogItems(items, 'mais-vendidos').map((item) => item.id)).toEqual(['a', 'b', 'c']);
    expect(sortCatalogItems(items, 'menos-vendidos').map((item) => item.id)).toEqual(['c', 'b', 'a']);
  });
});
