import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Headset, Lock, Storefront } from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import LoadingScreen from '../components/LoadingScreen';
import { postLoginPath } from '../lib/roles';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const user = await login(email, senha);
      navigate(postLoginPath(user.role));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setEnviando(false);
    }
  };

  if (enviando) return <LoadingScreen />;

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
          <h1 className="font-display text-2xl font-bold">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-ink-soft">Entre para abrir sua caderneta.</p>
        </div>

        <form className="space-y-4" onSubmit={entrar}>
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
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="text-xs font-medium text-ink-soft">Senha</label>
              <Link to="/recuperar-conta" className="text-xs font-semibold text-ledger-strong hover:underline dark:text-ledger">
                Esqueci minha senha
              </Link>
            </div>
            <input
              type="password"
              required
              maxLength={72}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
            />
          </div>

          {erro && (
            <div className="rounded-lg bg-stamp/10 p-3 text-xs font-medium text-stamp">
              <p>{erro}</p>
              <Link to="/suporte" className="mt-2 inline-flex items-center gap-1 font-bold underline">
                <Headset size={15} /> Falar com o suporte
              </Link>
            </div>
          )}

          <button
            type="submit"
            disabled={enviando}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-ledger py-3 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong active:scale-[0.98] disabled:opacity-60"
          >
            <Lock size={16} weight="fill" /> {enviando ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Ainda não usa o app?{' '}
          <Link to="/cadastro" className="font-semibold text-ledger-strong dark:text-ledger">
            Começar agora
          </Link>
        </p>
      </div>
      <Link to="/suporte" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft transition hover:text-ink">
        <Headset size={17} /> Precisa de ajuda? Fale com o suporte
      </Link>
    </div>
  );
}
