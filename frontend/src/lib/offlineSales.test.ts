// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { IndexedDbSalesStore, OfflineSalesQueue, type SaleIdentity, type OfflineSaleInput } from './offlineSales';

const owner = { tenantId: 'tenant-a', actorId: 'operator-a' };
const input: OfflineSaleInput = { items: [{ productId: 'coffee', description: 'Café', quantity: 1, unitPrice: 3 }], paymentMethod: 'dinheiro', cashSessionId: 'cash-a' };

describe('fila IndexedDB de vendas', () => {
  it('persiste duas vendas após recriar conexão e sincroniza somente tenant e ator originais', async () => {
    const name = crypto.randomUUID();
    const store = new IndexedDbSalesStore(name);
    const queue = new OfflineSalesQueue({ store, getIdentity: () => owner, isOnline: () => false, send: vi.fn() });
    const a = await queue.enqueue(input);
    const b = await queue.enqueue(input);
    await store.close();
    queue.dispose();
    const reopened = new IndexedDbSalesStore(name);
    expect((await reopened.list(owner)).map((sale) => sale.id).sort()).toEqual([a.id, b.id].sort());
    expect(await reopened.list({ ...owner, actorId: 'operator-b' })).toEqual([]);
    expect(await reopened.list({ ...owner, tenantId: 'tenant-b' })).toEqual([]);
    const send = vi.fn().mockResolvedValue(undefined);
    const restored = new OfflineSalesQueue({ store: reopened, getIdentity: () => owner, isOnline: () => true, send });
    await restored.sync();
    await restored.sync();
    expect(send).toHaveBeenCalledTimes(2);
    expect(await reopened.list(owner)).toEqual([]);
    await reopened.close();
  });

  it('reutiliza UUID se o servidor confirmou mas a resposta foi perdida', async () => {
    const store = new IndexedDbSalesStore(crypto.randomUUID());
    const seen = new Set<string>();
    const send = vi.fn(async (sale) => {
      seen.add(sale.payload.clientSaleId);
      if (send.mock.calls.length === 1) throw new TypeError('Network failure after commit');
    });
    const queue = new OfflineSalesQueue({ store, getIdentity: () => owner, isOnline: () => true, send });
    const sale = await queue.enqueue(input);
    await queue.sync();
    expect(queue.getSnapshot().pending).toBe(1);
    await queue.sync();
    expect(seen).toEqual(new Set([sale.id]));
    expect(send).toHaveBeenCalledTimes(2);
    expect(queue.getSnapshot().pending).toBe(0);
    await store.close();
  });

  it('interrompe transmissão e confirmação após trocar identidade ou travar sessão', async () => {
    let identity: SaleIdentity | null = owner;
    const store = new IndexedDbSalesStore(crypto.randomUUID());
    const send = vi.fn(async () => { identity = null; });
    const queue = new OfflineSalesQueue({ store, getIdentity: () => identity, isOnline: () => true, send });
    await queue.enqueue(input);
    await queue.enqueue(input);
    await queue.sync();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await store.list(owner)).toHaveLength(2);
    identity = { ...owner, actorId: 'operator-b' };
    await queue.sync();
    expect(send).toHaveBeenCalledTimes(1);
    await expect(queue.enqueue(input)).rejects.toThrow('operador');
    await store.close();
  });

  it('mantém venda rejeitada por conflito e impede sincronizações concorrentes', async () => {
    const store = new IndexedDbSalesStore(crypto.randomUUID());
    const send = vi.fn().mockRejectedValue(new Error('INSUFFICIENT_STOCK'));
    const queue = new OfflineSalesQueue({ store, getIdentity: () => owner, isOnline: () => true, send });
    await queue.enqueue(input);
    await Promise.all([queue.sync(), queue.sync()]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(queue.getSnapshot()).toMatchObject({ syncing: false, pending: 1 });
    expect(queue.getSnapshot().error).toBeTruthy();
    await store.close();
  });

  it('não confirma venda quando IndexedDB não consegue gravar', async () => {
    const queue = new OfflineSalesQueue({
      getIdentity: () => owner, isOnline: () => false, send: vi.fn(),
      store: { put: vi.fn().mockRejectedValue(new DOMException('Full', 'QuotaExceededError')), list: vi.fn(), remove: vi.fn() },
    });
    await expect(queue.enqueue(input)).rejects.toThrow('Full');
  });

  it('não mantém cliente em pagamento à vista e exige cliente no fiado', async () => {
    const store = new IndexedDbSalesStore(crypto.randomUUID());
    const queue = new OfflineSalesQueue({ store, getIdentity: () => owner, isOnline: () => false, send: vi.fn() });
    const sale = await queue.enqueue({ ...input, customerId: 'customer' });
    expect(sale.payload.customerId).toBeUndefined();
    expect(sale.payload).toMatchObject({ expectedTenantId: owner.tenantId, expectedActorId: owner.actorId });
    await expect(queue.enqueue({ ...input, paymentMethod: 'fiado' })).rejects.toThrow('cliente');
    await store.close();
  });
});
