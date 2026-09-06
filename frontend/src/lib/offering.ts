import type { Oferta, Produto, TipoEntrada } from '../types';

export const ENTRY_TYPE_OPTIONS: ReadonlyArray<{ valor: TipoEntrada; label: string }> = [
  { valor: 'produto', label: 'Produto' },
  { valor: 'servico', label: 'Serviço' },
  { valor: 'gorjeta', label: 'Gorjeta' },
];

export function catalogTypesForOffer(oferta?: Oferta): Produto['type'][] {
  if (oferta === 'produtos') return ['product'];
  if (oferta === 'servicos') return ['service'];
  return ['product', 'service'];
}

export function entryTypeOptionsForOffer(oferta?: Oferta) {
  const tiposCatalogo = catalogTypesForOffer(oferta);
  return ENTRY_TYPE_OPTIONS.filter(
    (opcao) =>
      opcao.valor === 'gorjeta' ||
      tiposCatalogo.includes(opcao.valor === 'produto' ? 'product' : 'service'),
  );
}

export function defaultCatalogType(oferta?: Oferta): Produto['type'] {
  return oferta === 'servicos' ? 'service' : 'product';
}

export function defaultEntryType(oferta?: Oferta): TipoEntrada {
  return oferta === 'servicos' ? 'servico' : 'produto';
}

export function isEntryTypeAllowed(tipo: TipoEntrada, oferta?: Oferta) {
  return entryTypeOptionsForOffer(oferta).some((opcao) => opcao.valor === tipo);
}
