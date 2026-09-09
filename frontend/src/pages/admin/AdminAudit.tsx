import { useEffect, useState, type FormEvent } from 'react';
import { DownloadSimple, FunnelSimple } from '@phosphor-icons/react';
import Pagination from '../../components/Pagination';
import { downloadAdminAuditCsv, listAdminAudit, type AdminAuditItem } from '../../lib/admin';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminAudit() {
  const [items, setItems] = useState<AdminAuditItem[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [draft, setDraft] = useState({ actor: '', action: '', target: '', from: '', to: '' });
  const [filters, setFilters] = useState(draft);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAdminAudit({ page, ...filters }).then((result) => { if (!cancelled) { setItems(result.items); setTotal(result.pagination.total); } })
      .catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : 'Não foi possível carregar a auditoria.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, filters]);
  const submit = (event: FormEvent) => { event.preventDefault(); setPage(1); setFilters(draft); };
  const field = 'rounded-lg border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30';

  return <div className="space-y-6 fade-in"><header><h1 className="font-display text-2xl font-bold">Auditoria da plataforma</h1><p className="mt-1 text-sm text-ink-soft">Ações administrativas e operacionais, sem conteúdo de vendas ou dados pessoais livres.</p></header>
    <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"><input aria-label="Filtrar por ator" value={draft.actor} onChange={(e) => setDraft({ ...draft, actor: e.target.value })} placeholder="Ator" className={field} /><input aria-label="Filtrar por ação" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })} placeholder="Ação exata" className={field} /><input aria-label="Filtrar por alvo" value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} placeholder="Conta ou negócio" className={field} /><input aria-label="Data inicial" type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={field} /><input aria-label="Data final" type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={field} /><div className="flex gap-2 sm:col-span-2 lg:col-span-5"><button className="inline-flex items-center gap-2 rounded-lg bg-ledger px-4 py-2 text-sm font-bold text-paper"><FunnelSimple size={17} /> Aplicar filtros</button><button type="button" disabled={!items.length} onClick={() => downloadAdminAuditCsv(items)} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm font-bold disabled:opacity-40"><DownloadSimple size={17} /> Exportar linhas visíveis</button></div></form>
    <section className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">{error ? <p className="p-6 text-sm font-semibold text-stamp">{error}</p> : loading ? <div className="h-52 animate-pulse bg-line/20" /> : !items.length ? <p className="p-8 text-center text-sm text-ink-soft">Nenhum evento encontrado.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-line/20 text-xs uppercase text-ink-soft"><tr><th className="px-4 py-3">Data</th><th className="px-4 py-3">Ator</th><th className="px-4 py-3">Ação</th><th className="px-4 py-3">Alvo</th><th className="px-4 py-3">Detalhes seguros</th></tr></thead><tbody className="divide-y divide-line">{items.map((item) => <tr key={item.id}><td className="whitespace-nowrap px-4 py-3 text-ink-soft">{dateFormatter.format(new Date(item.createdAt))}</td><td className="px-4 py-3"><p className="font-semibold">{item.actorName}</p><p className="text-xs text-ink-soft">{item.actorRole ?? '—'}</p></td><td className="px-4 py-3 font-ledger text-xs">{item.action}</td><td className="px-4 py-3"><p>{item.targetName}</p>{item.businessName && <p className="text-xs text-ink-soft">{item.businessName}</p>}</td><td className="max-w-xs truncate px-4 py-3 font-ledger text-xs text-ink-soft">{JSON.stringify(item.details)}</td></tr>)}</tbody></table></div>}<div className="border-t border-line px-4 pb-2"><Pagination currentPage={page} totalItems={total} onPageChange={setPage} itemLabel="eventos" /></div></section>
  </div>;
}
