import { useEffect, useState, type FormEvent } from 'react';
import { Buildings, MagnifyingGlass, ShieldCheck, UserMinus, UsersThree, WarningCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import {
  getAdminOperations, getAdminStats, listAdminClients, simulateAdminErrorSpike,
  type AccountStatus, type AdminClientSummary, type AdminOperations, type AdminStats,
} from '../../lib/admin';
import Pagination from '../../components/Pagination';
import { useAuth } from '../../context/AuthContext';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' });
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function AdminClients() {
  const { user } = useAuth();
  const [items, setItems] = useState<AdminClientSummary[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [operations, setOperations] = useState<AdminOperations | null>(null);
  const [period, setPeriod] = useState<7 | 30 | 90>(30);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'all' | AccountStatus>('all');
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listAdminClients({ page, search, status }).then((clients) => {
      if (!cancelled) { setItems(clients.items); setTotal(clients.pagination.total); }
    }).catch((loadError) => {
      if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as contas.');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, search, status]);

  useEffect(() => {
    let cancelled = false;
    void getAdminStats(period).then((result) => { if (!cancelled) setStats(result); })
      .catch((loadError) => { if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar os indicadores.'); });
    return () => { cancelled = true; };
  }, [period]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => void getAdminOperations().then((result) => { if (!cancelled) setOperations(result); }).catch(() => undefined);
    refresh();
    const interval = window.setInterval(refresh, 5 * 60_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, []);

  const submitSearch = (event: FormEvent) => { event.preventDefault(); setPage(1); setSearch(draftSearch.trim()); };
  const maxSeries = Math.max(1, ...(stats?.newAccountsSeries.map((item) => item.total) ?? [1]));
  const recentErrors = operations?.sentry.recentErrors ?? 0;
  const simulatedErrors = operations?.sentry.recentSimulatedErrors ?? 0;
  const cards = [
    { label: 'Contas ativas', value: stats?.active ?? 0, Icon: ShieldCheck, tone: 'text-ledger-strong dark:text-ledger bg-ledger/10' },
    { label: 'Negócios', value: stats?.businesses ?? 0, Icon: Buildings, tone: 'text-brass bg-brass/10' },
    { label: 'Suspensas', value: stats?.suspended ?? 0, Icon: UserMinus, tone: 'text-stamp bg-stamp/10' },
    { label: `Novas em ${period} dias`, value: stats?.newInPeriod ?? 0, Icon: UsersThree, tone: 'text-ledger-strong dark:text-ledger bg-ledger/10' },
  ];

  return (
    <div className="space-y-6 fade-in">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><h1 className="font-display text-2xl font-bold">Visão geral da plataforma</h1><p className="mt-1 text-sm text-ink-soft">Metadados de contas, adoção e sinais operacionais agregados.</p></div>
        <label className="text-xs font-bold uppercase tracking-wide text-ink-soft">Período
          <select value={period} onChange={(event) => setPeriod(Number(event.target.value) as 7 | 30 | 90)} className="ml-2 rounded-lg border border-line bg-paper-raised px-3 py-2 text-sm font-semibold normal-case text-ink">
            <option value={7}>7 dias</option><option value={30}>30 dias</option><option value={90}>90 dias</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map(({ label, value, Icon, tone }) => <div key={label} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm"><div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></div><p className="font-ledger text-2xl font-bold tabular-nums">{value}</p><p className="text-xs text-ink-soft">{label}</p></div>)}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold">Novas contas</h2>
          <div className="mt-5 flex h-40 items-end gap-2" aria-label="Gráfico de novas contas por período">
            {stats?.newAccountsSeries.length ? stats.newAccountsSeries.map((item) => <div key={item.period} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-xs font-bold">{item.total}</span><div className="w-full rounded-t-md bg-ledger" style={{ height: `${Math.max(6, item.total / maxSeries * 110)}px` }} /><span className="max-w-full truncate text-[10px] text-ink-soft">{dateFormatter.format(new Date(`${item.period}T12:00:00Z`))}</span></div>) : <p className="m-auto text-sm text-ink-soft">Nenhuma conta nova no período.</p>}
          </div>
        </section>
        <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
          <h2 className="font-display text-lg font-bold">Distribuição e adoção</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[['1 negócio', stats?.distribution.one ?? 0], ['2 negócios', stats?.distribution.two ?? 0], ['3 negócios', stats?.distribution.three ?? 0]].map(([label, value]) => <div key={label} className="rounded-xl bg-paper p-3"><p className="font-ledger text-xl font-bold">{value}</p><p className="text-[11px] text-ink-soft">{label}</p></div>)}
          </div>
          <dl className="mt-4 grid gap-2 sm:grid-cols-2">
            {[['Mais de um negócio', stats?.adoption.multiBusinessPercent], ['Consentimento WhatsApp', stats?.adoption.whatsappConsentPercent], ['Com operadores', stats?.adoption.operatorsPercent], ['Usaram fila offline', stats?.adoption.offlineQueuePercent]].map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm"><dt className="text-ink-soft">{label}</dt><dd className="font-ledger font-bold">{Number(value ?? 0).toLocaleString('pt-BR')}%</dd></div>)}
          </dl>
        </section>
      </div>

      <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Alertas operacionais</h2><p className="text-xs text-ink-soft">Atualização automática a cada 5 minutos.</p></div><WarningCircle size={24} className="text-brass" /></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Status label="API e PostgreSQL" value={operations?.health.ok ? 'Operacionais' : 'Indisponíveis'} healthy={operations?.health.ok === true} />
          <Status label={`Erros em ${operations?.sentry.windowMinutes ?? 15} min`} value={recentErrors > 0 ? `${recentErrors}${simulatedErrors ? ` (${simulatedErrors} simulados)` : ''}` : operations?.sentry.configured ? '0' : 'Sentry não configurado'} healthy={recentErrors > 0 ? false : operations?.sentry.configured ? true : undefined} />
          <Status label="Último uptime" value={operations?.uptime ? `${operations.uptime.healthy ? 'Saudável' : 'Falha'} · ${dateTimeFormatter.format(new Date(operations.uptime.checkedAt))}` : 'Sem retorno'} healthy={operations?.uptime?.healthy} />
          <Status label="Filas pendentes há +4h" value={String(operations?.offlineQueues.accountsWithStalePending ?? 0)} healthy={(operations?.offlineQueues.accountsWithStalePending ?? 0) === 0} />
        </div>
        {user?.adminLevel === 'SUPERADMIN' && <button type="button" disabled={simulating} onClick={() => {
          setSimulating(true);
          void simulateAdminErrorSpike().then((sentry) => setOperations((current) => current ? { ...current, sentry } : current))
            .catch((value) => setError(value instanceof Error ? value.message : 'Não foi possível simular o alerta.'))
            .finally(() => setSimulating(false));
        }} className="mt-3 rounded-lg border border-line px-3 py-2 text-xs font-bold text-ink-soft hover:border-brass hover:text-brass disabled:opacity-50">
          {simulating ? 'Simulando…' : 'Simular pico de 5 erros'}
        </button>}
      </section>

      <section className="overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-sm">
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-2"><label className="relative min-w-0 flex-1"><MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" size={17} /><input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} maxLength={100} placeholder="Responsável, negócio ou e-mail" className="w-full rounded-xl border border-line bg-paper py-2.5 pl-10 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30" /></label><button type="submit" className="rounded-xl bg-ledger px-4 text-sm font-bold text-paper">Buscar</button></form>
          <select value={status} onChange={(event) => { setStatus(event.target.value as 'all' | AccountStatus); setPage(1); }} className="rounded-xl border border-line bg-paper px-3 py-2.5 text-sm text-ink"><option value="all">Todos os status</option><option value="active">Ativos</option><option value="suspended">Suspensos</option></select>
        </div>
        {error ? <div className="p-8 text-center text-sm font-semibold text-stamp">{error}</div> : loading ? <div className="space-y-3 p-4" aria-label="Carregando contas">{[1,2,3,4].map((item) => <div key={item} className="h-14 animate-pulse rounded-xl bg-line/40" />)}</div> : items.length === 0 ? <div className="p-10 text-center"><UsersThree size={32} className="mx-auto mb-3 text-ink-soft" /><p className="font-semibold">Nenhuma conta encontrada</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-line/20 text-xs uppercase tracking-wide text-ink-soft"><tr><th className="px-4 py-3">Conta</th><th className="px-4 py-3">Negócios</th><th className="px-4 py-3">Cadastro</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ação</th></tr></thead><tbody className="divide-y divide-line">{items.map((client) => <tr key={client.id} className="hover:bg-line/10"><td className="px-4 py-3"><p className="font-semibold">{client.businessName}</p><p className="text-xs text-ink-soft">{client.email}</p></td><td className="px-4 py-3"><span className="font-ledger font-bold">{client.businessCount}/{client.maxBusinesses}</span><p className="text-xs text-ink-soft">{client.availableBusinessSlots ? `Cabem mais ${client.availableBusinessSlots}` : 'Limite atingido'}</p></td><td className="px-4 py-3 text-ink-soft">{dateFormatter.format(new Date(client.createdAt))}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${client.status === 'active' ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'bg-stamp/10 text-stamp'}`}>{client.status === 'active' ? 'Ativa' : 'Suspensa'}</span></td><td className="px-4 py-3 text-right"><Link className="font-semibold text-ledger-strong hover:underline dark:text-ledger" to={`/admin/clients/${client.id}`}>Ver detalhes</Link></td></tr>)}</tbody></table></div>}
        <div className="border-t border-line px-4 pb-2"><Pagination currentPage={page} totalItems={total} onPageChange={setPage} itemLabel="contas" /></div>
      </section>
    </div>
  );
}

function Status({ label, value, healthy }: { label: string; value: string; healthy?: boolean }) {
  return <div className="rounded-xl border border-line bg-paper p-3"><p className="text-xs text-ink-soft">{label}</p><p className={`mt-1 text-sm font-bold ${healthy === false ? 'text-stamp' : healthy ? 'text-ledger-strong dark:text-ledger' : 'text-brass'}`}>{value}</p></div>;
}
