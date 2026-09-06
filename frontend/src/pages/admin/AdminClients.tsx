import { useEffect, useState, type FormEvent } from 'react';
import { Buildings, MagnifyingGlass, ShieldCheck, UserMinus, UsersThree } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { getAdminStats, listAdminClients, type AccountStatus, type AdminClientSummary, type AdminStats } from '../../lib/admin';
import Pagination from '../../components/Pagination';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });

export default function AdminClients() {
  const [items, setItems] = useState<AdminClientSummary[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | AccountStatus>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const [clients, platformStats] = await Promise.all([
          listAdminClients({ page, search, status }),
          getAdminStats(),
        ]);
        if (cancelled) return;
        setItems(clients.items);
        setTotal(clients.pagination.total);
        setStats(platformStats);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os clientes.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [page, search, status]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  };

  const cards = [
    { label: 'Contas de clientes', value: stats?.total ?? 0, Icon: UsersThree, tone: 'text-ledger-strong dark:text-ledger bg-ledger/10' },
    { label: 'Ativas', value: stats?.active ?? 0, Icon: ShieldCheck, tone: 'text-ledger-strong dark:text-ledger bg-ledger/10' },
    { label: 'Suspensas', value: stats?.suspended ?? 0, Icon: UserMinus, tone: 'text-stamp bg-stamp/10' },
    { label: 'Novas em 30 dias', value: stats?.newLast30Days ?? 0, Icon: Buildings, tone: 'text-brass bg-brass/10' },
  ];

  return (
    <div className="space-y-6 fade-in">
      <div>
        <h1 className="font-display text-2xl font-bold">Clientes da plataforma</h1>
        <p className="mt-1 text-sm text-ink-soft">Gerencie acesso e acompanhe o uso agregado de cada conta.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
            <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div>
            <p className="font-ledger text-2xl font-bold tabular-nums">{value}</p>
            <p className="text-xs text-ink-soft">{label}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2">
            <label className="relative min-w-0 flex-1">
              <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" size={17} />
              <input
                value={draftSearch}
                onChange={(event) => setDraftSearch(event.target.value)}
                maxLength={100}
                placeholder="Nome do negócio ou e-mail"
                className="w-full rounded-xl border border-line bg-paper py-2.5 pl-10 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </label>
            <button type="submit" className="rounded-xl bg-ledger px-4 text-sm font-bold text-paper">Buscar</button>
          </form>
          <select
            value={status}
            onChange={(event) => { setStatus(event.target.value as 'all' | AccountStatus); setPage(1); }}
            className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
          </select>
        </div>

        {error ? (
          <div className="p-8 text-center"><p className="text-sm font-semibold text-stamp">{error}</p></div>
        ) : loading ? (
          <div className="space-y-3 p-4" aria-label="Carregando clientes">
            {[1, 2, 3, 4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-line/40" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <UsersThree size={32} className="mx-auto mb-3 text-ink-soft" />
            <p className="font-semibold">Nenhum cliente encontrado</p>
            <p className="mt-1 text-xs text-ink-soft">Tente alterar a busca ou o filtro.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-line/20 text-xs uppercase tracking-wide text-ink-soft">
                <tr><th className="px-4 py-3">Negócio</th><th className="px-4 py-3">E-mail</th><th className="px-4 py-3">Cadastro</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((client) => (
                  <tr key={client.id} className="transition hover:bg-line/10">
                    <td className="px-4 py-3 font-semibold text-ink">{client.businessName}</td>
                    <td className="px-4 py-3 text-ink-soft">{client.email}</td>
                    <td className="px-4 py-3 text-ink-soft">{dateFormatter.format(new Date(client.createdAt))}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${client.status === 'active' ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'bg-stamp/10 text-stamp'}`}>
                        {client.status === 'active' ? 'Ativo' : 'Suspenso'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right"><Link className="font-semibold text-ledger-strong hover:underline dark:text-ledger" to={`/admin/clients/${client.id}`}>Ver detalhes</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line px-4 pb-2">
          <Pagination currentPage={page} totalItems={total} onPageChange={setPage} itemLabel="clientes" />
        </div>
      </section>
    </div>
  );
}
