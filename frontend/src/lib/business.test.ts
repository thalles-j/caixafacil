// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearStoredToken, setStoredToken } from './auth';
import {
  registerSaleRequest,
  registerTransactionRequest,
  reopenCashSessionRequest,
  resolveTransactionIdentificationRequest,
} from './business';

function fakeToken(): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  return `${encode({ alg: 'HS256' })}.${encode({ sub: 'user-1', email: 'teste@example.com', exp })}.fake`;
}

function mockSuccess() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ data: {} }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

describe('requisições financeiras', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    clearStoredToken();
    setStoredToken(fakeToken());
  });

  it('nunca vincula cliente a uma venda comum, mesmo que um id seja informado por engano', async () => {
    const fetchMock = mockSuccess();

    await registerSaleRequest(
      [{ description: 'Café', quantity: 1, unitPrice: 10 }],
      'dinheiro',
      'cliente-indevido',
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ paymentMethod: 'dinheiro' });
    expect(body).not.toHaveProperty('customerId');
  });

  it('vincula cliente somente quando a forma selecionada é Fiado', async () => {
    const fetchMock = mockSuccess();

    await registerSaleRequest(
      [{ description: 'Serviço', quantity: 1, unitPrice: 50 }],
      'fiado',
      'cliente-1',
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ paymentMethod: 'fiado', customerId: 'cliente-1' });
  });

  it('envia o tipo da entrada ao banco para a classificação de pendências', async () => {
    const fetchMock = mockSuccess();

    await registerTransactionRequest({
      type: 'entrada',
      description: 'Venda rápida',
      amount: 25,
      paymentMethod: 'pix',
      entryKind: 'produto',
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({ type: 'entrada', paymentMethod: 'pix', entryKind: 'produto' });
  });

  it('envia o item do catálogo ao resolver uma entrada pendente', async () => {
    const fetchMock = mockSuccess();

    await resolveTransactionIdentificationRequest('transaction-1', 'produto', 'product-1');

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/transactions/transaction-1/identification');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      classification: 'produto',
      productId: 'product-1',
    });
  });

  it('envia a categoria da despesa e permite resolver uma pendência depois', async () => {
    const fetchMock = mockSuccess();

    await registerTransactionRequest({
      type: 'saida',
      description: 'Compra rápida',
      amount: 40,
      paymentMethod: 'dinheiro',
      expenseKind: 'mercadoria',
    });
    await resolveTransactionIdentificationRequest('transaction-1', 'fornecedor');

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toMatchObject({ expenseKind: 'mercadoria' });
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/transactions/transaction-1/identification');
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ classification: 'fornecedor' });
  });

  it('envia o item concreto do catálogo ao resolver uma entrada pendente', async () => {
    const fetchMock = mockSuccess();

    await resolveTransactionIdentificationRequest('transaction-2', 'servico', 'servico-1');

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/transactions/transaction-2/identification');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      classification: 'servico',
      productId: 'servico-1',
    });
  });

  it('envia a quantidade de produtos para baixa no estoque', async () => {
    const fetchMock = mockSuccess();

    await resolveTransactionIdentificationRequest('transaction-3', 'produto', 'produto-1', 3);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      classification: 'produto',
      productId: 'produto-1',
      quantity: 3,
    });
  });

  it('envia o valor corrigido somente após a revisão da pendência', async () => {
    const fetchMock = mockSuccess();

    await resolveTransactionIdentificationRequest('transaction-4', 'produto', 'produto-1', 3, 36);

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      classification: 'produto',
      productId: 'produto-1',
      quantity: 3,
      correctedAmount: 36,
    });
  });

  it('exige confirmação explícita ao solicitar a correção do último fechamento', async () => {
    const fetchMock = mockSuccess();

    await reopenCashSessionRequest('caixa-1');

    expect(fetchMock.mock.calls[0]?.[0]).toContain('/cash-sessions/caixa-1/reopen');
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe('POST');
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({ confirm: true });
  });
});
