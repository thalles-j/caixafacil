import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Headset, Storefront, UserPlus } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';

export default function Cadastro() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmaSenha, setConfirmaSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const criarConta = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const senhaInvalida = passwordPolicyError(senha);
    if (senhaInvalida) {
      setErro(senhaInvalida);
      return;
    }
    if (senha !== confirmaSenha) {
      setErro('As senhas não coincidem.');
      return;
    }

    setErro(null);
    setEnviando(true);
    try {
      await register(email, senha, confirmaSenha);
      navigate('/onboarding');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível criar a conta.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-12 text-ink">
      <Link to="/" className="mb-8 flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Voltar para a apresentação
      </Link>

      <div className="receipt-edge w-full max-w-sm rounded-2xl border border-line bg-paper-raised px-7 pb-10 pt-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ledger text-paper">
            <Storefront size={24} weight="fill" />
          </div>
          <p className="mb-1 font-ledger text-[10px] font-bold uppercase tracking-[0.18em] text-ledger-strong dark:text-ledger">CaixaFácil</p>
          <h1 className="font-display text-2xl font-bold">Criar sua conta</h1>
          <p className="mt-1 text-sm text-ink-soft">Leva menos de um minuto.</p>
        </div>

        <form className="space-y-4" onSubmit={criarConta}>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">E-mail</label>
            <input
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="voce@seunegocio.com"
              className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Senha</label>
            <input
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder={PASSWORD_HINT}
              className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-ink-soft">Confirmar senha</label>
            <input
              type="password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              value={confirmaSenha}
              onChange={(e) => setConfirmaSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>

          {erro && <p className="text-xs font-medium text-stamp">{erro}</p>}

          <button
            type="submit"
            disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ledger py-3 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong active:scale-[0.98] disabled:opacity-60"
          >
            <UserPlus size={16} weight="fill" /> {enviando ? 'Criando conta...' : 'Criar conta'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-ledger-strong dark:text-ledger">
            Entrar
          </Link>
        </p>
      </div>
      <Link to="/suporte" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft transition hover:text-ink">
        <Headset size={17} /> Precisa de ajuda? Fale com o suporte
      </Link>
    </div>
  );
}
