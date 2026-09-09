import type { FormaPagamento } from '../types';
import type { SaleItemInput } from './business';
import type { SaleReceipt } from './printing';

export interface SaleIdentity { tenantId: string; actorId: string }
export interface OfflineSaleInput {
  items: SaleItemInput[];
  paymentMethod: FormaPagamento;
  customerId?: string;
  cashSessionId: string;
}
export interface OfflineSalePayload extends OfflineSaleInput {
  clientSaleId: string;
  occurredAt: string;
  offline: true;
  expectedTenantId: string;
  expectedActorId: string;
}
export interface PendingSale extends SaleIdentity {
  id: string;
  payload: OfflineSalePayload;
  receipt?: SaleReceipt;
}
export interface SalesQueueStore {
  put(sale: PendingSale): Promise<void>;
  list(identity: SaleIdentity): Promise<PendingSale[]>;
  remove(id: string): Promise<void>;
}

export function sameSaleIdentity(a: SaleIdentity | null, b: SaleIdentity | null): boolean {
  return Boolean(a && b && a.tenantId === b.tenantId && a.actorId === b.actorId);
}

export class IndexedDbSalesStore implements SalesQueueStore {
  private database?: Promise<IDBDatabase>;
  constructor(private readonly name = 'caixafacil-offline-sales-v1') {}

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.name, 1);
        request.onupgradeneeded = () => {
          const store = request.result.createObjectStore('sales', { keyPath: 'id' });
          store.createIndex('identity', ['tenantId', 'actorId']);
        };
        request.onsuccess = () => {
          request.result.onversionchange = () => { request.result.close(); this.database = undefined; };
          resolve(request.result);
        };
        request.onerror = () => { this.database = undefined; reject(request.error); };
        request.onblocked = () => reject(new Error('Feche outras abas para atualizar a fila de vendas.'));
      });
    }
    return this.database;
  }

  private async write(action: (store: IDBObjectStore) => void): Promise<void> {
    const database = await this.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('sales', 'readwrite', { durability: 'strict' });
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Não foi possível persistir a venda.'));
      transaction.onerror = () => reject(transaction.error);
      action(transaction.objectStore('sales'));
    });
  }

  put(sale: PendingSale): Promise<void> { return this.write((store) => { store.add(sale); }); }
  remove(id: string): Promise<void> { return this.write((store) => { store.delete(id); }); }

  async list(identity: SaleIdentity): Promise<PendingSale[]> {
    const database = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction('sales', 'readonly');
      const request = transaction.objectStore('sales').index('identity').getAll([identity.tenantId, identity.actorId]);
      transaction.oncomplete = () => resolve((request.result as PendingSale[])
        .sort((a, b) => a.payload.occurredAt.localeCompare(b.payload.occurredAt) || a.id.localeCompare(b.id)));
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async close(): Promise<void> { (await this.database)?.close(); this.database = undefined; }
}

export interface SalesQueueState {
  online: boolean;
  syncing: boolean;
  pending: number;
  error: string | null;
}

export interface SalesQueueOptions {
  getIdentity(): SaleIdentity | null;
  send(sale: PendingSale, signal: AbortSignal): Promise<void>;
  isOnline?: () => boolean;
  store?: SalesQueueStore;
  reportStatus?(pendingCount: number, oldestPendingAt: string | null): Promise<void>;
}

/** One instance per authenticated provider. Dispose it when identity changes. */
export class OfflineSalesQueue {
  private readonly store: SalesQueueStore;
  private readonly listeners = new Set<() => void>();
  private state: SalesQueueState;
  private disposed = false;
  private inFlight: Promise<void> | null = null;
  private readonly abort = new AbortController();
  private readonly identity: SaleIdentity | null;

  constructor(private readonly options: SalesQueueOptions) {
    this.store = options.store ?? new IndexedDbSalesStore();
    this.identity = options.getIdentity();
    this.state = { online: this.online(), syncing: false, pending: 0, error: null };
  }

  private online(): boolean { return this.options.isOnline?.() ?? navigator.onLine; }
  private active(): boolean { return !this.disposed && sameSaleIdentity(this.identity, this.options.getIdentity()); }
  private update(patch: Partial<SalesQueueState>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((listener) => listener());
  }
  getSnapshot = (): SalesQueueState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async refresh(): Promise<void> {
    if (!this.active() || !this.identity) return;
    const pending = await this.store.list(this.identity);
    if (this.active()) {
      this.update({ pending: pending.length, online: this.online() });
      if (this.online() && this.options.reportStatus) {
        void this.options.reportStatus(pending.length, pending[0]?.payload.occurredAt ?? null).catch(() => undefined);
      }
    }
  }

  async pendingSales(): Promise<PendingSale[]> {
    return this.active() && this.identity ? this.store.list(this.identity) : [];
  }

  async enqueue(input: OfflineSaleInput, receipt?: Omit<SaleReceipt, 'id' | 'occurredAt' | 'pendingSync'>): Promise<PendingSale> {
    if (!this.active() || !this.identity) throw new Error('Entre novamente com o operador desta venda.');
    if (!input.cashSessionId || !input.items.length || input.items.some((item) =>
      !item.description.trim() || !Number.isFinite(item.quantity) || item.quantity <= 0 ||
      !Number.isFinite(item.unitPrice) || item.unitPrice < 0)) throw new Error('Confira os itens e o caixa aberto antes de salvar.');
    if (input.paymentMethod === 'fiado' && !input.customerId) throw new Error('Selecione um cliente já cadastrado para vender fiado offline.');
    const id = crypto.randomUUID();
    const occurredAt = new Date().toISOString();
    const sale: PendingSale = {
      ...this.identity, id,
      payload: {
        ...structuredClone(input), customerId: input.paymentMethod === 'fiado' ? input.customerId : undefined,
        clientSaleId: id, occurredAt, offline: true,
        expectedTenantId: this.identity.tenantId, expectedActorId: this.identity.actorId,
      },
      ...(receipt ? { receipt: { ...structuredClone(receipt), id, occurredAt, pendingSync: true } } : {}),
    };
    // Only report success after the IndexedDB transaction commits. Quota failures preserve the cart.
    await this.store.put(sale);
    await this.refresh();
    return sale;
  }

  sync(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.synchronize().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async synchronize(): Promise<void> {
    if (!this.active() || !this.identity) return;
    this.update({ online: this.online(), error: null });
    if (!this.online()) { await this.refresh(); return; }
    this.update({ syncing: true });
    try {
      for (const sale of await this.store.list(this.identity)) {
        if (!this.active() || !this.online()) break;
        // Defense against accidental store adapter bugs; backend also validates expected identity.
        if (!sameSaleIdentity(sale, this.identity)) throw new Error('Venda pertence a outra sessão.');
        await this.options.send(sale, this.abort.signal);
        if (!this.active()) break;
        // If response/ack is lost, retain original clientSaleId for server-side deduplication.
        await this.store.remove(sale.id);
      }
    } catch {
      if (this.active()) this.update({ error: 'Há vendas aguardando confirmação. Reconecte e entre com o mesmo operador para tentar novamente.' });
    } finally {
      if (this.active()) {
        this.update({ syncing: false, online: this.online() });
        await this.refresh();
      }
    }
  }

  /** Retry transient server failures as well as browser online/offline transitions. */
  start(): () => void {
    const retry = () => { void this.sync().catch(() => {
      if (this.active()) this.update({ syncing: false, error: 'Não foi possível acessar a fila local. Mantenha esta página aberta.' });
    }); };
    window.addEventListener('online', retry);
    window.addEventListener('offline', retry);
    const interval = window.setInterval(retry, 30_000);
    retry();
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('offline', retry);
      window.clearInterval(interval);
      this.dispose();
    };
  }

  dispose(): void { this.disposed = true; this.abort.abort(); this.listeners.clear(); }
}
