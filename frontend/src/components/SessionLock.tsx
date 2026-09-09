import { useState, type FormEvent } from 'react';
import { LockKey } from '@phosphor-icons/react';

export default function SessionLock({ onUnlock, onLogout }: { onUnlock: (password: string) => Promise<void>; onLogout: () => Promise<void> }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onUnlock(password); setPassword(''); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Não foi possível liberar o caixa.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-paper/95 p-5 backdrop-blur" role="dialog" aria-modal="true" aria-label="Caixa bloqueado">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-paper-raised p-6 shadow-xl">
      <LockKey size={34} className="text-ledger" /><div><h1 className="font-display text-xl font-bold text-ink">Caixa bloqueado</h1>
      <p className="mt-1 text-sm text-ink-soft">Confirme sua senha para continuar. A venda em andamento permanece aberta.</p></div>
      <label className="block text-sm font-semibold text-ink">Senha<input autoFocus type="password" value={password} onChange={e=>setPassword(e.target.value)}
        className="mt-1 w-full rounded-xl border border-line bg-paper px-3 py-2" /></label>
      {error && <p role="alert" className="text-sm text-stamp">{error}</p>}
      <button disabled={busy || !password} className="w-full rounded-xl bg-ledger py-2.5 font-bold text-paper disabled:opacity-50">{busy?'Liberando…':'Liberar caixa'}</button>
      <button type="button" onClick={()=>void onLogout()} className="w-full text-sm text-ink-soft underline">Sair completamente</button>
    </form>
  </div>;
}
