import { useEffect, useState } from 'react';
import { ArrowLeft, Buildings, Eye, EyeSlash, Key, PencilSimple, ShieldCheck, Trash, UserMinus, UsersThree } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Modal from '../../components/Modal';
import { useAuth } from '../../context/AuthContext';
import {
  deleteAdminClient, getAdminClient, resetAdminClientPassword, updateAdminBusinessStatus,
  updateAdminClientName, updateAdminClientStatus, type AdminClientDetail as ClientDetail,
} from '../../lib/admin';
import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from '../../lib/passwordPolicy';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
type AccountAction = 'status' | 'delete' | 'name' | 'password';
type PendingAction = { type: AccountAction; businessId?: never; targetName: string } |
  { type: 'business'; businessId: string; targetName: string; nextStatus: 'active' | 'archived' };
const sameName = (value: string, expected: string) => value.trim().normalize('NFKC').toLocaleLowerCase('pt-BR') === expected.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');

export default function AdminClientDetail() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const superadmin = user?.adminLevel === 'SUPERADMIN';
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [newName, setNewName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => { setClient(await getAdminClient(id)); };
  useEffect(() => {
    let cancelled = false;
    void getAdminClient(id).then((result) => { if (!cancelled) setClient(result); })
      .catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : 'Não foi possível carregar a conta.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);
  const openAccountAction = (type: AccountAction) => { if (!client) return; setPending({ type, targetName: client.businessName }); setConfirmationName(''); setNewName(type === 'name' ? client.businessName : ''); setNewPassword(''); setConfirmPassword(''); setShowPasswords(false); setActionError(null); setSuccess(null); };
  const close = () => { if (!saving) { setPending(null); setActionError(null); } };

  const confirm = async () => {
    if (!client || !pending) return;
    if (!sameName(confirmationName, pending.targetName)) { setActionError('Digite o nome exatamente como exibido para confirmar.'); return; }
    if (pending.type === 'name' && (newName.trim().length < 2 || newName.trim().length > 100)) { setActionError('O novo nome deve ter entre 2 e 100 caracteres.'); return; }
    if (pending.type === 'password') {
      const policyError = passwordPolicyError(newPassword);
      if (policyError) { setActionError(policyError); return; }
      if (newPassword !== confirmPassword) { setActionError('A confirmação da nova senha não confere.'); return; }
    }
    setSaving(true); setActionError(null);
    try {
      if (pending.type === 'delete') { await deleteAdminClient(client.id, confirmationName); navigate('/admin', { replace: true }); return; }
      if (pending.type === 'status') {
        const status = client.status === 'active' ? 'suspended' : 'active';
        await updateAdminClientStatus(client.id, status, confirmationName); setClient({ ...client, status });
        setSuccess(status === 'active' ? 'Conta inteira reativada.' : 'Conta e sessões de todos os negócios suspensas.');
      } else if (pending.type === 'name') {
        const updated = await updateAdminClientName(client.id, newName.trim(), confirmationName);
        setClient({ ...client, name: updated.name, businessName: updated.businessName }); setSuccess('Nome da conta alterado.');
      } else if (pending.type === 'password') {
        const result = await resetAdminClientPassword(client.id, newPassword, confirmPassword, confirmationName); setSuccess(result.message);
      } else if (pending.type === 'business') {
        await updateAdminBusinessStatus(client.id, pending.businessId, pending.nextStatus, confirmationName);
        await reload(); setSuccess(pending.nextStatus === 'archived' ? 'Negócio arquivado e sessões revogadas.' : 'Negócio reativado.');
      }
      setPending(null);
    } catch (value) { setActionError(value instanceof Error ? value.message : 'Não foi possível concluir a ação.'); }
    finally { setSaving(false); }
  };

  if (loading && !client) return <div className="h-72 animate-pulse rounded-2xl bg-line/30" aria-label="Carregando conta" />;
  if (error && !client) return <div className="rounded-2xl border border-stamp/20 bg-stamp/10 p-6 text-sm font-semibold text-stamp">{error}</div>;
  if (!client) return null;
  const modalTitle = pending?.type === 'business' ? `${pending.nextStatus === 'archived' ? 'Arquivar' : 'Reativar'} negócio?` : pending?.type === 'delete' ? 'Excluir conta inteira?' : pending?.type === 'status' ? `${client.status === 'active' ? 'Suspender' : 'Ativar'} conta inteira?` : pending?.type === 'name' ? 'Alterar nome da conta' : 'Redefinir senha';

  return <div className="space-y-6 fade-in">
    <Link to="/admin" className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink"><ArrowLeft size={16} /> Voltar às contas</Link>
    <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><div className="mb-2 flex flex-wrap items-center gap-2"><h1 className="font-display text-2xl font-bold">{client.businessName}</h1><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${client.status === 'active' ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'bg-stamp/10 text-stamp'}`}>{client.status === 'active' ? 'Ativa' : 'Suspensa'}</span></div><p className="text-sm text-ink-soft">{client.email}</p><p className="mt-1 text-xs text-ink-soft">Criada em {dateFormatter.format(new Date(client.createdAt))}</p></div>
        <div className="flex flex-wrap gap-2">{superadmin && <button onClick={() => openAccountAction('name')} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold"><PencilSimple size={17} /> Alterar nome</button>}<button onClick={() => openAccountAction('password')} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm font-bold"><Key size={17} /> Nova senha</button>{superadmin && <><button onClick={() => openAccountAction('status')} className="flex items-center gap-2 rounded-lg bg-brass/10 px-3 py-2 text-sm font-bold text-brass">{client.status === 'active' ? <UserMinus size={17} /> : <ShieldCheck size={17} />}{client.status === 'active' ? 'Suspender conta' : 'Ativar conta'}</button><button onClick={() => openAccountAction('delete')} className="flex items-center gap-2 rounded-lg bg-stamp/10 px-3 py-2 text-sm font-bold text-stamp"><Trash size={17} /> Excluir conta</button></>}</div>
      </div>
      <p className="mt-4 rounded-xl border border-line bg-paper p-3 text-xs text-ink-soft">Suspender ou excluir atua sobre o login e todos os negócios da conta. O arquivamento abaixo atua somente no negócio escolhido.</p>
      {success && <p role="status" className="mt-4 rounded-lg bg-ledger/10 p-3 text-sm font-semibold text-ledger-strong dark:text-ledger">{success}</p>}
    </section>

    <section><div className="mb-3 flex items-end justify-between"><div><h2 className="text-sm font-bold uppercase tracking-wide text-ink-soft">Negócios vinculados</h2><p className="mt-1 text-xs text-ink-soft">Somente metadados operacionais, sem catálogo, vendas, clientes ou fiado.</p></div><span className="font-ledger text-sm font-bold">{client.businessCount}/{client.maxBusinesses} · {client.availableBusinessSlots} vagas</span></div>
      <div className="grid gap-3 lg:grid-cols-2">{client.businesses.map((business) => <article key={business.id} className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger"><Buildings size={21} /></span><div><h3 className="font-display font-bold">{business.name}</h3><p className="mt-1 text-xs text-ink-soft">{business.category} · <span className="capitalize">{business.offering}</span></p></div></div><span className={`rounded-full px-2 py-1 text-xs font-bold ${business.status === 'active' ? 'bg-ledger/10 text-ledger-strong dark:text-ledger' : 'bg-line text-ink-soft'}`}>{business.status === 'active' ? 'Ativo' : 'Arquivado'}</span></div><div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-xs text-ink-soft"><span className="flex items-center gap-1"><UsersThree size={15} /> {business.operatorCount} operador(es)</span><span>{dateFormatter.format(new Date(business.createdAt))}</span></div>{superadmin && <button onClick={() => { setPending({ type: 'business', businessId: business.id, targetName: business.name, nextStatus: business.status === 'active' ? 'archived' : 'active' }); setConfirmationName(''); setActionError(null); }} className={`mt-4 w-full rounded-lg px-3 py-2 text-sm font-bold ${business.status === 'active' ? 'border border-stamp/25 text-stamp' : 'bg-ledger/10 text-ledger-strong dark:text-ledger'}`}>{business.status === 'active' ? 'Arquivar este negócio' : 'Reativar este negócio'}</button>}</article>)}</div>
    </section>

    <Modal open={pending !== null} onClose={close} title={modalTitle}><div className="space-y-4">{pending?.type === 'delete' && <p className="text-sm text-ink-soft">O login, todos os negócios e seus dados serão excluídos definitivamente.</p>}{pending?.type === 'status' && <p className="text-sm text-ink-soft">Esta ação altera o acesso da conta inteira e revoga as sessões de todos os negócios.</p>}{pending?.type === 'business' && <p className="text-sm text-ink-soft">Esta ação afeta somente o negócio selecionado e revoga suas sessões.</p>}{pending?.type === 'name' && <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">Novo nome da conta</span><input autoFocus maxLength={100} value={newName} onChange={(event) => setNewName(event.target.value)} className="w-full rounded-lg border border-line bg-paper p-2.5" /></label>}{pending?.type === 'password' && <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1 block text-xs font-semibold text-ink-soft">Nova senha</span><span className="relative block"><input autoFocus type={showPasswords ? 'text' : 'password'} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={PASSWORD_HINT} className="w-full rounded-lg border border-line bg-paper py-2.5 pl-2.5 pr-11" /><button type="button" onClick={() => setShowPasswords((visible) => !visible)} aria-label={showPasswords ? 'Ocultar senhas' : 'Mostrar senhas'} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-ink-soft hover:text-ink">{showPasswords ? <Eye size={19} /> : <EyeSlash size={19} />}</button></span></label><label><span className="mb-1 block text-xs font-semibold text-ink-soft">Confirmar senha</span><input type={showPasswords ? 'text' : 'password'} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full rounded-lg border border-line bg-paper p-2.5" /></label></div>}<label className="block rounded-xl border border-brass/30 bg-brass/5 p-3"><span className="text-xs text-ink-soft">Para confirmar, digite <strong className="select-all text-ink">{pending?.targetName}</strong></span><input value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} autoComplete="off" className="mt-2 w-full rounded-lg border border-line bg-paper p-2.5" /></label>{actionError && <p role="alert" className="text-xs font-semibold text-stamp">{actionError}</p>}<div className="flex gap-3"><button disabled={saving} onClick={close} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold">Cancelar</button><button disabled={saving || !pending || !sameName(confirmationName, pending.targetName)} onClick={() => void confirm()} className="flex-1 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper disabled:opacity-40">{saving ? 'Processando…' : 'Confirmar ação'}</button></div></div></Modal>
  </div>;
}
