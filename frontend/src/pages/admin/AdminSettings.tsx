import { useEffect, useState } from 'react';
import { EnvelopeSimple, Headset, Key, PencilSimple, ShieldCheck, UserCircle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import Modal from '../../components/Modal';
import {
  changeAdminProfilePassword,
  getAdminProfile,
  updateAdminProfileName,
  type AdminProfile,
} from '../../lib/admin';
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyError,
} from '../../lib/passwordPolicy';

type SettingAction = 'name' | 'password';

function sameName(value: string, expected: string) {
  return value.trim().normalize('NFKC').toLocaleLowerCase('pt-BR') ===
    expected.trim().normalize('NFKC').toLocaleLowerCase('pt-BR');
}

export default function AdminSettings() {
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [action, setAction] = useState<SettingAction | null>(null);
  const [confirmationName, setConfirmationName] = useState('');
  const [newName, setNewName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAdminProfile()
      .then((result) => { if (!cancelled) setProfile(result); })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o perfil.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const openAction = (nextAction: SettingAction) => {
    setAction(nextAction);
    setNewName(nextAction === 'name' ? profile?.name ?? '' : '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setConfirmationName('');
    setActionError(null);
    setSuccess(null);
  };

  const closeAction = () => {
    if (!saving) setAction(null);
  };

  const save = async () => {
    if (!profile || !action) return;
    if (!sameName(confirmationName, profile.name)) {
      setActionError('Digite seu nome atual exatamente como exibido para confirmar.');
      return;
    }
    if (action === 'name' && (newName.trim().length < 2 || newName.trim().length > 100)) {
      setActionError('O novo nome deve ter entre 2 e 100 caracteres.');
      return;
    }
    if (action === 'password') {
      const passwordError = passwordPolicyError(newPassword);
      if (passwordError) {
        setActionError(passwordError);
        return;
      }
      if (newPassword !== confirmPassword) {
        setActionError('A confirmação da nova senha não confere.');
        return;
      }
      if (!currentPassword) {
        setActionError('Informe sua senha atual.');
        return;
      }
    }

    setSaving(true);
    setActionError(null);
    try {
      if (action === 'name') {
        const updated = await updateAdminProfileName(newName.trim(), confirmationName);
        setProfile({ ...profile, name: updated.name });
        setSuccess('Nome administrativo alterado com sucesso.');
      } else {
        const response = await changeAdminProfilePassword({
          currentPassword,
          newPassword,
          confirmPassword,
          confirmationName,
        });
        setSuccess(response.message);
      }
      setAction(null);
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'Não foi possível salvar a alteração.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-line/30" aria-label="Carregando configurações" />;
  if (error && !profile) return <div className="rounded-2xl border border-stamp/20 bg-stamp/10 p-6 text-sm font-semibold text-stamp">{error}</div>;
  if (!profile) return null;

  return (
    <div className="space-y-6 fade-in">
      <header>
        <h1 className="font-display text-2xl font-bold">Configurações administrativas</h1>
        <p className="mt-1 text-sm text-ink-soft">Gerencie sua identidade e credenciais de acesso ao painel.</p>
      </header>

      {success && <p role="status" className="rounded-xl bg-ledger/10 p-4 text-sm font-semibold text-ledger-strong dark:text-ledger">{success}</p>}

      <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
        <div className="mb-5 flex items-start gap-3 border-b border-line pb-4">
          <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger"><ShieldCheck size={22} weight="duotone" /></span>
          <div>
            <h2 className="font-display text-lg font-bold">Conta administrativa</h2>
            <p className="mt-1 text-xs text-ink-soft">Alterações sensíveis ficam registradas na auditoria.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase text-ink-soft"><UserCircle size={17} /> Nome</p>
            <p className="mt-2 font-semibold">{profile.name}</p>
          </div>
          <div className="rounded-xl border border-line bg-paper p-4">
            <p className="flex items-center gap-2 text-xs font-bold uppercase text-ink-soft"><EnvelopeSimple size={17} /> E-mail</p>
            <p className="mt-2 break-all font-semibold">{profile.email}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button onClick={() => openAction('name')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-line px-4 py-2.5 text-sm font-bold transition hover:bg-line/30"><PencilSimple size={18} /> Alterar meu nome</button>
          <button onClick={() => openAction('password')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong"><Key size={18} /> Alterar minha senha</button>
        </div>
      </section>

      <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Headset size={22} className="mt-0.5 text-ledger-strong dark:text-ledger" />
            <div><h2 className="font-bold">Suporte</h2><p className="mt-1 text-xs text-ink-soft">Problemas no painel ou na sua conta administrativa.</p></div>
          </div>
          <Link to="/suporte" className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm font-bold transition hover:bg-line/30">Abrir suporte</Link>
        </div>
      </section>

      <Modal open={action !== null} onClose={closeAction} title={action === 'name' ? 'Alterar meu nome' : 'Alterar minha senha'}>
        <div className="space-y-4">
          {action === 'name' && (
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-soft">Novo nome</span>
              <input autoFocus maxLength={100} value={newName} onChange={(event) => setNewName(event.target.value)} className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" />
            </label>
          )}
          {action === 'password' && (
            <div className="space-y-3">
              <label className="block"><span className="mb-1 block text-xs font-semibold text-ink-soft">Senha atual</span><input autoFocus type="password" maxLength={PASSWORD_MAX_LENGTH} value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" /></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label><span className="mb-1 block text-xs font-semibold text-ink-soft">Nova senha</span><input type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder={PASSWORD_HINT} className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" /></label>
                <label><span className="mb-1 block text-xs font-semibold text-ink-soft">Confirmar senha</span><input type="password" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Digite novamente" className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30" /></label>
              </div>
            </div>
          )}
          <label className="block rounded-xl border border-brass/30 bg-brass/5 p-3">
            <span className="block text-xs text-ink-soft">Para confirmar, digite <strong className="select-all text-ink">{profile.name}</strong></span>
            <input value={confirmationName} onChange={(event) => setConfirmationName(event.target.value)} autoComplete="off" placeholder={profile.name} className="mt-2 w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-brass/30" />
          </label>
          {actionError && <p role="alert" className="text-xs font-semibold text-stamp">{actionError}</p>}
          <div className="flex gap-3">
            <button disabled={saving} onClick={closeAction} className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold transition hover:bg-line/30 disabled:opacity-60">Cancelar</button>
            <button disabled={saving || !sameName(confirmationName, profile.name)} onClick={() => void save()} className="flex-1 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Salvando…' : 'Confirmar alteração'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
