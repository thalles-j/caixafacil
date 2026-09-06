import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Buildings,
  CashRegister,
  Key,
  Package,
  PencilSimple,
  Receipt,
  ShieldCheck,
  Trash,
  UserMinus,
  UsersThree,
} from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import {
  deleteAdminClient,
  getAdminClient,
  resetAdminClientPassword,
  updateAdminClientName,
  updateAdminClientStatus,
  type AdminClientDetail as ClientDetail,
} from '../../lib/admin';
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyError,
} from '../../lib/passwordPolicy';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
type AdminAction = 'status' | 'delete' | 'name' | 'password';

function sameName(value: string, expected: string) {
  return value.trim().normalize('NFKC').toLocaleLowerCase('pt-BR') ===
    expected.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

export default function AdminClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<AdminAction | null>(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await getAdminClient(id);
        if (!cancelled) setClient(result);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o cliente.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [id]);

  const openAction = (action: AdminAction) => {
    setPendingAction(action);
    setConfirmationName('');
    setNewName(action === 'name' ? client?.businessName ?? '' : '');
    setNewPassword('');
    setConfirmPassword('');
    setActionError(null);
    setSuccess(null);
  };

  const closeAction = () => {
    if (saving) return;
    setPendingAction(null);
    setActionError(null);
  };

  const confirmAction = async () => {
    if (!client || !pendingAction) return;
    if (!sameName(confirmationName, client.businessName)) {
      setActionError('Digite o nome exatamente como exibido para confirmar.');
      return;
    }
    if (pendingAction === 'name' && (newName.trim().length < 2 || newName.trim().length > 100)) {
      setActionError('O novo nome deve ter entre 2 e 100 caracteres.');
      return;
    }
    if (pendingAction === 'password') {
      const passwordError = passwordPolicyError(newPassword);
      if (passwordError) {
        setActionError(passwordError);
        return;
      }
      if (newPassword !== confirmPassword) {
        setActionError('A confirmação da nova senha não confere.');
        return;
      }
    }

    setSaving(true);
    setActionError(null);
    setError(null);
    try {
      if (pendingAction === 'delete') {
        await deleteAdminClient(client.id, confirmationName);
        navigate('/admin', { replace: true });
        return;
      }
      if (pendingAction === 'status') {
        const nextStatus = client.status === 'active' ? 'suspended' : 'active';
        await updateAdminClientStatus(client.id, nextStatus, confirmationName);
        setClient({ ...client, status: nextStatus });
        setSuccess(nextStatus === 'active' ? 'Conta ativada com sucesso.' : 'Conta suspensa e sessões revogadas.');
      } else if (pendingAction === 'name') {
        const updated = await updateAdminClientName(client.id, newName.trim(), confirmationName);
        setClient({ ...client, name: updated.name, businessName: updated.businessName });
        setSuccess('Nome alterado com sucesso.');
      } else {
        const result = await resetAdminClientPassword(client.id, newPassword, confirmPassword, confirmationName);
        setSuccess(result.message);
      }
      setPendingAction(null);
    } catch (actionErrorValue) {
      setActionError(actionErrorValue instanceof Error ? actionErrorValue.message : 'Não foi possível concluir a ação.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-72 animate-pulse rounded-2xl bg-line/30" aria-label="Carregando cliente" />;
  if (error && !client) return <div className="rounded-2xl border border-stamp/20 bg-stamp/10 p-6 text-sm font-semibold text-stamp">{error}</div>;
  if (!client) return null;

  const usageCards = [
    ['Produtos ativos', client.usage.products, Package],
    ['Vendas concluídas', client.usage.sales, Receipt],
    ['Fechamentos', client.usage.cashClosings, CashRegister],
    ['Clientes cadastrados', client.usage.customers, UsersThree],
    ['Fiados em aberto', client.usage.openCredits, Buildings],
  ] as const;

  const modalTitle = pendingAction === 'delete'
    ? 'Excluir conta definitivamente?'
    : pendingAction === 'status'
      ? client.status === 'active' ? 'Suspender conta?' : 'Ativar conta?'
      : pendingAction === 'name'
        ? 'Alterar nome do cliente'
        : 'Redefinir senha do cliente';

  return (
    <div className="space-y-6 fade-in">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"><ArrowLeft size={16} /> Voltar aos clientes</Link>
      <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">{client.businessName}</h1>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${client.status === 'active' ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'bg-stamp/10 text-stamp'}`}>{client.status === 'active' ? 'Ativo' : 'Suspenso'}</span>
            </div>
            <p className="text-sm text-ink-soft">{client.email}</p>
            <p className="mt-1 text-xs text-ink-soft">Criado em {dateFormatter.format(new Date(client.createdAt))}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => openAction('name')} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink transition hover:bg-line/30"><PencilSimple size={17} /> Alterar nome</button>
            <button onClick={() => openAction('password')} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold text-ink transition hover:bg-line/30"><Key size={17} /> Nova senha</button>
            <button onClick={() => openAction('status')} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${client.status === 'active' ? 'bg-brass/10 text-brass' : 'bg-ledger/10 text-ledger-strong dark:text-ledger'}`}>
              {client.status === 'active' ? <UserMinus size={17} /> : <ShieldCheck size={17} />}{client.status === 'active' ? 'Suspender' : 'Ativar'}
            </button>
            <button onClick={() => openAction('delete')} className="flex items-center gap-2 rounded-lg bg-stamp/10 px-3 py-2 text-sm font-bold text-stamp"><Trash size={17} /> Excluir</button>
          </div>
        </div>
        {error && <p role="alert" className="mt-4 text-sm font-semibold text-stamp">{error}</p>}
        {success && <p role="status" className="mt-4 rounded-lg bg-ledger/10 p-3 text-sm font-semibold text-ledger-strong dark:text-ledger">{success}</p>}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft">Resumo de uso</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {usageCards.map(([label, value, Icon]) => <div key={label} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm"><Icon size={20} className="mb-3 text-ledger-strong dark:text-ledger" /><p className="font-ledger text-2xl font-bold">{value}</p><p className="text-xs text-ink-soft">{label}</p></div>)}
        </div>
      </section>

      <section className="grid gap-3 rounded-2xl border border-line bg-paper-raised p-5 text-sm shadow-sm sm:grid-cols-2">
        <div><p className="text-xs font-bold uppercase text-ink-soft">Responsável</p><p className="mt-1 font-semibold">{client.name ?? 'Não informado'}</p></div>
        <div><p className="text-xs font-bold uppercase text-ink-soft">Ramo</p><p className="mt-1 font-semibold">{client.businessCategory ?? 'Não informado'}</p></div>
        <div><p className="text-xs font-bold uppercase text-ink-soft">Oferta</p><p className="mt-1 font-semibold capitalize">{client.offering ?? 'Não informado'}</p></div>
        <div><p className="text-xs font-bold uppercase text-ink-soft">Onboarding</p><p className="mt-1 font-semibold">{client.onboardingCompleted ? 'Concluído' : 'Pendente'}</p></div>
      </section>

      <Modal open={pendingAction !== null} onClose={closeAction} title={modalTitle}>
        <div className="space-y-4">
          {pendingAction === 'delete' && <p className="text-sm text-ink-soft">A conta e todos os seus dados serão excluídos. Esta ação não pode ser desfeita.</p>}
          {pendingAction === 'status' && <p className="text-sm text-ink-soft">{client.status === 'active' ? 'As sessões serão revogadas e o cliente não poderá entrar até a reativação.' : 'O cliente poderá entrar novamente usando suas credenciais.'}</p>}
          {pendingAction === 'name' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">Novo nome</span>
              <input autoFocus maxLength={100} value={newName} onChange={(event) => setNewName(event.target.value)} className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" />
            </label>
          )}
          {pendingAction === 'password' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink-soft">Nova senha</span>
                <input autoFocus type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={PASSWORD_HINT} className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" />
              </label>
              <label>
                <span className="mb-1 block text-xs font-semibold text-ink-soft">Confirmar senha</span>
                <input type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Digite novamente" className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" />
              </label>
            </div>
          )}
          <label className="block rounded-xl border border-brass/30 bg-brass/5 p-3">
            <span className="block text-xs text-ink-soft">Para confirmar, digite <strong className="select-all text-ink">{client.businessName}</strong></span>
            <input
              autoFocus={pendingAction === 'status' || pendingAction === 'delete'}
              value={confirmationName}
              onChange={(event) => setConfirmationName(event.target.value)}
              placeholder={client.businessName}
              autoComplete="off"
              className="mt-2 w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brass/30"
            />
          </label>
          {actionError && <p role="alert" className="text-xs font-semibold text-stamp">{actionError}</p>}
          <div className="flex gap-3">
            <button disabled={saving} onClick={closeAction} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition hover:bg-line/30 disabled:opacity-60">Cancelar</button>
            <button
              disabled={saving || !sameName(confirmationName, client.businessName)}
              onClick={() => void confirmAction()}
              className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-bold text-paper transition disabled:cursor-not-allowed disabled:opacity-40 ${pendingAction === 'delete' ? 'bg-stamp' : 'bg-ledger'}`}
            >
              {saving ? 'Processando…' : 'Confirmar alteração'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
