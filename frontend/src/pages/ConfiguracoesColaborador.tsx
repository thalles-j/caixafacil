import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  EnvelopeSimple,
  Headset,
  Key,
  Moon,
  ShieldCheck,
  SignOut,
  Sun,
  UserCircle,
} from '@phosphor-icons/react';
import Modal from '../components/Modal';
import { useAuth } from '../context/AuthContext';
import {
  PASSWORD_HINT,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordPolicyError,
} from '../lib/passwordPolicy';
import { useDarkMode } from '../lib/theme';

export default function ConfiguracoesColaborador() {
  const { user, changePassword, logout } = useAuth();
  const [darkMode, setDarkMode] = useDarkMode();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarNovaSenha, setConfirmarNovaSenha] = useState('');
  const [senhaSalvando, setSenhaSalvando] = useState(false);
  const [senhaErro, setSenhaErro] = useState<string | null>(null);
  const [senhaSucesso, setSenhaSucesso] = useState<string | null>(null);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [saindo, setSaindo] = useState(false);

  const alterarSenha = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSenhaErro(null);
    setSenhaSucesso(null);

    const erroDePolitica = passwordPolicyError(novaSenha);
    if (erroDePolitica) {
      setSenhaErro(erroDePolitica);
      return;
    }
    if (novaSenha !== confirmarNovaSenha) {
      setSenhaErro('A confirmação da nova senha não confere.');
      return;
    }

    setSenhaSalvando(true);
    try {
      const mensagem = await changePassword(senhaAtual, novaSenha, confirmarNovaSenha);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarNovaSenha('');
      setSenhaSucesso(mensagem);
    } catch (error) {
      setSenhaErro(error instanceof Error ? error.message : 'Não foi possível alterar a senha.');
    } finally {
      setSenhaSalvando(false);
    }
  };

  const sair = async () => {
    setSaindo(true);
    try {
      await logout();
    } finally {
      setSaindo(false);
      setConfirmandoSaida(false);
    }
  };

  const inputClasses =
    'w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30';

  return (
    <div className="fade-in space-y-6">
      <header>
        <h2 className="font-display text-2xl font-bold text-ink">Minhas configurações</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Consulte seu acesso e ajuste suas preferências pessoais.
        </p>
      </header>

      <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm sm:p-6">
        <div className="mb-5 flex items-start gap-3 border-b border-line pb-4">
          <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger">
            <UserCircle size={22} weight="duotone" />
          </span>
          <div>
            <h3 className="font-display text-lg font-bold text-ink">Meu acesso</h3>
            <p className="mt-1 text-xs text-ink-soft">
              Seu acesso é individual e está vinculado a este estabelecimento.
            </p>
          </div>
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-line bg-paper p-4">
            <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
              <UserCircle size={17} /> Nome
            </dt>
            <dd className="mt-2 break-words text-sm font-semibold text-ink">{user?.name || 'Colaborador'}</dd>
          </div>
          <div className="rounded-xl border border-line bg-paper p-4">
            <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
              <EnvelopeSimple size={17} /> E-mail
            </dt>
            <dd className="mt-2 break-all text-sm font-semibold text-ink">{user?.email}</dd>
          </div>
          <div className="rounded-xl border border-line bg-paper p-4 sm:col-span-2">
            <dt className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
              <Briefcase size={17} /> Estabelecimento
            </dt>
            <dd className="mt-2 text-sm font-semibold text-ink">{user?.businessName || 'Negócio atual'}</dd>
            <p className="mt-1 text-xs text-ink-soft">
              Para alterar seus dados ou permissões, fale com o proprietário do negócio.
            </p>
          </div>
        </dl>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3 border-b border-line pb-4">
            <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger">
              <ShieldCheck size={21} weight="duotone" />
            </span>
            <div>
              <h3 className="font-display text-lg font-bold text-ink">Senha e segurança</h3>
              <p className="mt-1 text-xs text-ink-soft">Altere a senha usada no seu próprio acesso.</p>
            </div>
          </div>

          <form onSubmit={alterarSenha} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Senha atual</span>
              <div className="relative">
                <Key size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
                <input
                  type="password"
                  autoComplete="current-password"
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={senhaAtual}
                  onChange={(event) => setSenhaAtual(event.target.value)}
                  required
                  className={`${inputClasses} pl-10`}
                />
              </div>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label>
                <span className="mb-1 block text-xs font-medium text-ink-soft">Nova senha</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={novaSenha}
                  onChange={(event) => setNovaSenha(event.target.value)}
                  placeholder={PASSWORD_HINT}
                  required
                  className={inputClasses}
                />
              </label>
              <label>
                <span className="mb-1 block text-xs font-medium text-ink-soft">Confirmar nova senha</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={PASSWORD_MIN_LENGTH}
                  maxLength={PASSWORD_MAX_LENGTH}
                  value={confirmarNovaSenha}
                  onChange={(event) => setConfirmarNovaSenha(event.target.value)}
                  placeholder="Digite novamente"
                  required
                  className={inputClasses}
                />
              </label>
            </div>
            {senhaErro && <p role="alert" className="text-xs font-semibold text-stamp">{senhaErro}</p>}
            {senhaSucesso && <p role="status" className="text-xs font-semibold text-ledger-strong dark:text-ledger">{senhaSucesso}</p>}
            <button
              type="submit"
              disabled={senhaSalvando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:opacity-50 sm:ml-auto sm:w-auto"
            >
              <Key size={17} /> {senhaSalvando ? 'Alterando…' : 'Alterar senha'}
            </button>
          </form>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-ink-soft">Aparência</h3>
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {darkMode ? <Moon size={18} /> : <Sun size={18} />} Modo escuro
              </span>
              <input
                type="checkbox"
                checked={darkMode}
                onChange={(event) => setDarkMode(event.target.checked)}
                className="h-5 w-5 accent-ledger"
              />
            </label>
          </section>

          <section className="rounded-2xl border border-line bg-paper-raised p-5 shadow-sm">
            <div className="flex items-start gap-3">
              <Headset size={22} className="mt-0.5 shrink-0 text-ledger-strong dark:text-ledger" />
              <div>
                <h3 className="font-bold text-ink">Ajuda e suporte</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Está com problema no acesso ou na operação do caixa? Fale com a equipe.
                </p>
              </div>
            </div>
            <Link
              to="/suporte"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-ledger/25 bg-ledger/10 px-4 py-2.5 text-sm font-bold text-ledger-strong transition hover:bg-ledger/20 dark:text-ledger"
            >
              Falar com o suporte <ArrowRight size={17} weight="bold" />
            </Link>
          </section>

          <button
            type="button"
            onClick={() => setConfirmandoSaida(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-stamp/30 bg-stamp/5 px-4 py-3 text-sm font-bold text-stamp transition hover:bg-stamp/10"
          >
            <SignOut size={18} /> Sair da conta
          </button>
        </div>
      </div>

      <Modal open={confirmandoSaida} onClose={() => !saindo && setConfirmandoSaida(false)} title="Sair da conta?">
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Sua sessão será encerrada. Você precisará informar e-mail e senha para entrar novamente.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={saindo}
              onClick={() => setConfirmandoSaida(false)}
              className="flex-1 rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-line/30 disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saindo}
              onClick={() => void sair()}
              className="flex-1 rounded-lg bg-stamp px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-stamp/90 disabled:opacity-60"
            >
              {saindo ? 'Saindo…' : 'Sim, sair'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
