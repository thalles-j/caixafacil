import { describe, expect, it } from 'vitest';
import { buildWhatsAppChargeUrl, normalizeWhatsAppPhone, whatsappChargeUrl } from './whatsapp';

describe('cobrança por WhatsApp', () => {
  it('normaliza um celular brasileiro e adiciona o código do país', () => {
    expect(normalizeWhatsAppPhone('(11) 99999-8888')).toBe('5511999998888');
    expect(normalizeWhatsAppPhone('+55 11 99999-8888')).toBe('5511999998888');
  });

  it('recusa telefones incompletos', () => {
    expect(normalizeWhatsAppPhone('1234')).toBeNull();
  });

  it('monta uma mensagem de cobrança com valor, referência e vencimento', () => {
    const url = buildWhatsAppChargeUrl({
      telefone: '(11) 99999-8888',
      clienteNome: 'Maria',
      valor: 42.5,
      descricao: 'Venda fiado',
      vencimento: '2026-08-10',
      nomeNegocio: 'Caixa Fácil',
    });

    expect(url).not.toBeNull();
    const parsed = new URL(url!);
    expect(parsed.hostname).toBe('wa.me');
    expect(parsed.pathname).toBe('/5511999998888');
    expect(parsed.searchParams.get('text')).toContain('Maria');
    expect(parsed.searchParams.get('text')).toContain('R$ 42,50');
    expect(parsed.searchParams.get('text')).toContain('Venda fiado');
    expect(parsed.searchParams.get('text')).toContain('10/08/2026');
  });
});


describe('whatsappChargeUrl', () => {
  it('normaliza um celular brasileiro e inclui nome e valor na cobrança', () => {
    const url = whatsappChargeUrl('(11) 99999-1234', 'Ana', 12.5);
    expect(url).toContain('https://wa.me/5511999991234?text=');
    expect(decodeURIComponent(url ?? '')).toContain('Ana');
    expect(decodeURIComponent(url ?? '')).toContain('R$ 12,50');
  });

  it('não cria link para telefone inválido', () => {
    expect(whatsappChargeUrl('123', 'Ana', 10)).toBeNull();
  });
});
