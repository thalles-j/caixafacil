import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, getPagination, paginateItems } from './pagination';

describe('paginação', () => {
  it('limita cada página a 15 registros por padrão', () => {
    const result = paginateItems(Array.from({ length: 32 }, (_, index) => index + 1), 2);

    expect(DEFAULT_PAGE_SIZE).toBe(15);
    expect(result.items).toEqual(Array.from({ length: 15 }, (_, index) => index + 16));
    expect(result).toMatchObject({ currentPage: 2, totalPages: 3, from: 16, to: 30 });
  });

  it('ajusta automaticamente uma página que deixou de existir', () => {
    expect(getPagination(4, 8)).toMatchObject({ currentPage: 1, totalPages: 1, from: 1, to: 4 });
  });

  it('trata listas vazias sem produzir intervalos inválidos', () => {
    expect(getPagination(0, 1)).toMatchObject({ currentPage: 1, totalPages: 1, from: 0, to: 0 });
  });
});
