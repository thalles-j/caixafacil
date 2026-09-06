import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle, EnvelopeSimple, Headset, Key } from '@phosphor-icons/react';
import { forgotPasswordRequest, resetPasswordRequest } from '../lib/auth';
import { PASSWORD_HINT, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordPolicyError } from '../lib/passwordPolicy';

export default function RecuperarConta() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (!searchParams.has('token')) return;
    // O token continua no estado do formulário, mas sai da barra de endereço
    // para não permanecer no histórico nem vazar por cópia acidental da URL.
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }, [searchParams]);

  const solicitarRecuperacao = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro(null);
    setMensagem(null);
    setEnviando(true);
    try {
      const resposta = await forgotPasswordRequest(email);
      setMensagem(resposta.message);
      if (resposta.resetToken) setToken(resposta.resetToken);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível solicitar a recuperação.');
    } finally {
      setEnviando(false);
    }
  };

  const alterarSenha = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro(null);
    const senhaInvalida = passwordPolicyError(senha);
    if (senhaInvalida) {
      setErro(senhaInvalida);
      return;
    }
    if (senha !== confirmarSenha) {
      setErro('As senhas não coincidem.');
      return;
    }
    setEnviando(true);
    try {
      const resposta = await resetPasswordRequest(token, senha, confirmarSenha);
      setMensagem(resposta.message);
      setConcluido(true);
    } catch (error) {
      setErro(error instanceof Error ? error.message : 'Não foi possível alterar a senha.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 py-12 text-ink">
      <Link to="/login" className="mb-8 flex items-center gap-1 text-sm font-medium text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> Voltar para o login
      </Link>

      <div className="receipt-edge w-full max-w-sm rounded-2xl border border-line bg-paper-raised px-7 pb-10 pt-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-ledger text-paper">
            {concluido ? <CheckCircle size={25} weight="fill" /> : token ? <Key size={24} weight="fill" /> : <EnvelopeSimple size={24} weight="fill" />}
          </div>
          <p className="mb-1 font-ledger text-[10px] font-bold uppercase tracking-[0.18em] text-ledger-strong dark:text-ledger">CaixaFácil</p>
          <h1 className="font-display text-2xl font-bold">
            {concluido ? 'Senha alterada' : token ? 'Crie uma nova senha' : 'Recuperar conta'}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {concluido
              ? 'Sua conta está pronta para ser acessada novamente.'
              : token
                ? 'Use 7 caracteres ou mais, incluindo uma letra maiúscula e um caractere especial.'
                : 'Informe seu e-mail para iniciar a recuperação.'}
          </p>
        </div>

        {concluido ? (
          <Link
            to="/login"
            className="flex w-full items-center justify-center rounded-lg bg-ledger py-3 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong"
          >
            Voltar e entrar
          </Link>
        ) : token ? (
          <form className="space-y-4" onSubmit={alterarSenha}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Nova senha</label>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                value={senha}
                onChange={(event) => setSenha(event.target.value)}
                placeholder={PASSWORD_HINT}
                className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">Confirmar nova senha</label>
              <input
                type="password"
                required
                minLength={PASSWORD_MIN_LENGTH}
                maxLength={PASSWORD_MAX_LENGTH}
                autoComplete="new-password"
                value={confirmarSenha}
                onChange={(event) => setConfirmarSenha(event.target.value)}
                placeholder="Digite a senha novamente"
                className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            {erro && <p className="text-xs font-medium text-stamp">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ledger py-3 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong disabled:opacity-60"
            >
              <Key size={16} weight="fill" /> {enviando ? 'Alterando...' : 'Alterar senha'}
            </button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={solicitarRecuperacao}>
            <div>
              <label className="mb-1 block text-xs font-medium text-ink-soft">E-mail</label>
              <input
                type="email"
                required
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="voce@seunegocio.com"
                className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink focus:border-ledger focus:outline-none focus:ring-2 focus:ring-ledger/30"
              />
            </div>
            {mensagem && <p className="rounded-lg bg-ledger/10 p-3 text-xs font-medium text-ledger-strong dark:text-ledger">{mensagem}</p>}
            {erro && <p className="text-xs font-medium text-stamp">{erro}</p>}
            <button
              type="submit"
              disabled={enviando}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-ledger py-3 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong disabled:opacity-60"
            >
              <EnvelopeSimple size={16} weight="fill" /> {enviando ? 'Enviando...' : 'Continuar'}
            </button>
          </form>
        )}
      </div>
      <Link to="/suporte" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-ink-soft transition hover:text-ink">
        <Headset size={17} /> Não conseguiu recuperar? Fale com o suporte
      </Link>
    </div>
  );
}
