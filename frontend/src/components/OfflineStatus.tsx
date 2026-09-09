import { useSyncExternalStore } from 'react';
import { ArrowsClockwise, CloudCheck, CloudSlash, SpinnerGap } from '@phosphor-icons/react';
import type { OfflineSalesQueue } from '../lib/offlineSales';

export default function OfflineStatus({ queue }: { queue: OfflineSalesQueue }) {
  const state = useSyncExternalStore(queue.subscribe, queue.getSnapshot, queue.getSnapshot);
  const Icon = state.syncing ? SpinnerGap : state.online ? CloudCheck : CloudSlash;
  const label = state.syncing
    ? state.pending > 0 ? `Sincronizando ${state.pending} ${state.pending === 1 ? 'venda' : 'vendas'}` : 'Verificando sincronização'
    : state.online
      ? state.pending > 0 ? `${state.pending} ${state.pending === 1 ? 'venda pendente' : 'vendas pendentes'}` : 'Tudo sincronizado'
      : state.pending > 0 ? `Offline · ${state.pending} ${state.pending === 1 ? 'venda pendente' : 'vendas pendentes'}` : 'Offline';

  return <aside role="status" aria-live="polite" className="text-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        state.online
          ? 'border-ledger/20 bg-ledger/10 text-ledger-strong dark:text-ledger'
          : 'border-brass/30 bg-brass/10 text-brass'
      }`}>
        <Icon size={15} weight="bold" className={state.syncing ? 'animate-spin' : ''} />
        {label}
      </span>
      {state.pending > 0 && state.online && <button type="button" disabled={state.syncing} onClick={() => void queue.sync()} className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-ledger-strong hover:bg-ledger/10 disabled:opacity-50 dark:text-ledger"><ArrowsClockwise size={14} />Tentar novamente</button>}
    </div>
    {state.error && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-brass">{state.error} Se o erro persistir, confira o estoque e a sessão de caixa com o responsável.</p>}
    {!state.online && <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-soft">Vendas e cupons continuam disponíveis com o caixa aberto. Não limpe os dados do navegador antes de sincronizar.</p>}
  </aside>;
}
