// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildEscPos, buildReceiptHtml, DEFAULT_RECEIPT_SETTINGS, drawerPulse, receiptLines, type SaleReceipt } from './printing';

const receipt: SaleReceipt = {
  id: 'sale-123', occurredAt: '2026-09-05T15:00:00Z', businessName: 'Loja', operatorName: 'Ana',
  paymentMethod: 'dinheiro', items: [{ description: 'Café', quantity: 2, unitPrice: 5.5 }], pendingSync: true,
};

describe('cupom térmico', () => {
  it.each([58, 80] as const)('formata %s mm, valores e aviso offline sem recursos de rede', (paperWidth) => {
    const html = buildReceiptHtml(receipt, { ...DEFAULT_RECEIPT_SETTINGS, paperWidth });
    expect(html).toContain(`width:${paperWidth}mm`);
    expect(html).toContain('TOTAL: R$ 11,00');
    expect(html).toContain('CUPOM NÃO FISCAL');
    expect(html).toContain('AGUARDA SINCRONIZAÇÃO');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('src=');
  });

  it('neutraliza injeção HTML e comandos de controle no conteúdo do cliente', () => {
    const malicious = { ...receipt, operatorName: '<img src=x onerror=alert(1)>\u001b\u0070' };
    const html = buildReceiptHtml(malicious);
    expect(html).toContain('&lt;img');
    expect(html).not.toContain('<img');
    const bytes = [...buildEscPos(malicious)];
    expect(bytes.filter((byte) => byte === 0x1b)).toHaveLength(2); // Only init/font commands.
    expect(bytes.some((byte, index) => byte === 0x1b && bytes[index + 1] === 0x70)).toBe(false);
  });

  it('adiciona um único pulso de gaveta somente quando solicitado', () => {
    expect([...drawerPulse()]).toEqual([0x1b, 0x70, 0, 50, 250]);
    const bytes = [...buildEscPos(receipt, DEFAULT_RECEIPT_SETTINGS, true)];
    expect(bytes.filter((byte, index) => byte === 0x1b && bytes[index + 1] === 0x70)).toHaveLength(1);
  });

  it('respeita configuração de razão social, operador e pagamento', () => {
    const text = receiptLines(receipt, { paperWidth: 58, legalName: 'Loja Ltda', showOperator: false, showPaymentMethod: false }).join('\n');
    expect(text).toContain('Loja Ltda');
    expect(text).not.toContain('Operador:');
    expect(text).not.toContain('Pagamento:');
  });
});
