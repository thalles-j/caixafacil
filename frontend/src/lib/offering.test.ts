import { describe, expect, it } from 'vitest';
import {
  catalogTypesForOffer,
  defaultCatalogType,
  defaultEntryType,
  entryTypeOptionsForOffer,
  isEntryTypeAllowed,
} from './offering';

describe('regras da oferta do negócio', () => {
  it('libera somente produtos e gorjetas para negócios de produtos', () => {
    expect(catalogTypesForOffer('produtos')).toEqual(['product']);
    expect(entryTypeOptionsForOffer('produtos').map((opcao) => opcao.valor)).toEqual(['produto', 'gorjeta']);
    expect(defaultCatalogType('produtos')).toBe('product');
    expect(defaultEntryType('produtos')).toBe('produto');
    expect(isEntryTypeAllowed('servico', 'produtos')).toBe(false);
  });

  it('libera somente serviços e gorjetas para negócios de serviços', () => {
    expect(catalogTypesForOffer('servicos')).toEqual(['service']);
    expect(entryTypeOptionsForOffer('servicos').map((opcao) => opcao.valor)).toEqual(['servico', 'gorjeta']);
    expect(defaultCatalogType('servicos')).toBe('service');
    expect(defaultEntryType('servicos')).toBe('servico');
    expect(isEntryTypeAllowed('produto', 'servicos')).toBe(false);
  });

  it('mantém todas as opções quando a oferta é ambos ou ainda não existe', () => {
    expect(catalogTypesForOffer('ambos')).toEqual(['product', 'service']);
    expect(entryTypeOptionsForOffer('ambos').map((opcao) => opcao.valor)).toEqual([
      'produto',
      'servico',
      'gorjeta',
    ]);
    expect(entryTypeOptionsForOffer().map((opcao) => opcao.valor)).toEqual([
      'produto',
      'servico',
      'gorjeta',
    ]);
  });
});
