import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle,
  EnvelopeSimple,
  Headset,
  Key,
  PaperPlaneTilt,
  ShieldCheck,
  Storefront,
  Wrench,
} from '@phosphor-icons/react';
import { useAuth } from '../context/AuthContext';
import { contactSupportRequest, type SupportCategory } from '../lib/support';

const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL ?? 'suporte@caixafacil.app';

const QUICK_TOPICS = [
  { icon: Key, title: 'Acesso à conta', description: 'Login, senha, recuperação ou conta suspensa.' },
  { icon: Wrench, title: 'Problema técnico', description: 'Erro, travamento ou algo que não funcionou.' },
  { icon: ShieldCheck, title: 'Dados e segurança', description: 'Privacidade, backup, restauração e proteção.' },
];

export default function Suporte() {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [category, setCategory] = useState<SupportCategory>('acesso');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const backPath = user?.role === 'admin' ? '/admin' : user ? '/configuracoes' : '/';
  const backLabel = user ? 'Voltar para o aplicativo' : 'Voltar para o início';

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSending(true);
    try {
      const response = await contactSupportRequest({ name, email, category, message, website });
      setSuccess(response.message);
      setMessage('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível enviar sua mensagem.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line bg-paper-raised/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to={backPath} className="inline-flex items-center gap-2 text-sm font-semibold text-ink-soft transition hover:text-ink">
            <ArrowLeft size={17} /> {backLabel}
          </Link>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ledger text-paper">
              <Storefront size={16} weight="fill" />
            </span>
            <span className="font-display text-sm font-bold">CaixaFácil</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-ledger/10 text-ledger-strong dark:text-ledger">
            <Headset size={25} weight="duotone" />
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold">Como podemos ajudar?</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Conte o que aconteceu e informe um e-mail válido. A equipe responderá por ele.
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {QUICK_TOPICS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm">
              <Icon size={21} className="text-ledger-strong dark:text-ledger" />
              <h2 className="mt-3 text-sm font-bold">{title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{description}</p>
            </div>
          ))}
        </div>

        <section className="mx-auto mt-6 max-w-2xl rounded-2xl border border-line bg-paper-raised p-5 shadow-sm sm:p-7">
          <div className="mb-5 flex items-start gap-3 border-b border-line pb-4">
            <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger">
              <EnvelopeSimple size={20} />
            </span>
            <div>
              <h2 className="font-display text-lg font-bold">Fale com o suporte</h2>
              <p className="mt-1 text-xs text-ink-soft">Não envie senhas, tokens ou dados de cartão.</p>
            </div>
          </div>

          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-medium text-ink-soft">Seu nome</span>
              <input
                required
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30"
                placeholder="Como podemos chamar você?"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-medium text-ink-soft">E-mail para retorno</span>
              <input
                required
                type="email"
                maxLength={254}
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30"
                placeholder="voce@exemplo.com"
              />
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Assunto</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value as SupportCategory)}
                className="catalog-sort-select w-full rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30"
              >
                <option value="acesso">Acesso à conta</option>
                <option value="suspensao">Conta suspensa</option>
                <option value="financeiro">Caixa e finanças</option>
                <option value="dados">Dados e segurança</option>
                <option value="tecnico">Problema técnico</option>
                <option value="outro">Outro assunto</option>
              </select>
            </label>
            <label className="sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-ink-soft">Mensagem</span>
              <textarea
                required
                maxLength={2_000}
                rows={6}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                className="w-full resize-y rounded-lg border border-line bg-paper p-2.5 text-sm text-ink outline-none focus:ring-2 focus:ring-ledger/30"
                placeholder="Descreva o problema e o que você estava fazendo quando ele aconteceu."
              />
              <span className="mt-1 block text-right font-ledger text-[10px] text-ink-soft">{message.length}/2000</span>
            </label>
            <label className="absolute -left-[9999px]" aria-hidden="true">
              Site
              <input tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} />
            </label>

            {error && (
              <div role="alert" className="rounded-lg bg-stamp/10 p-3 text-xs font-medium text-stamp sm:col-span-2">
                {error}{' '}
                <a className="font-bold underline" href={`mailto:${SUPPORT_EMAIL}`}>Abrir aplicativo de e-mail</a>
              </div>
            )}
            {success && (
              <p role="status" className="flex items-center gap-2 rounded-lg bg-ledger/10 p-3 text-xs font-semibold text-ledger-strong dark:text-ledger sm:col-span-2">
                <CheckCircle size={17} weight="fill" /> {success}
              </p>
            )}

            <button
              type="submit"
              disabled={sending}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-ledger px-5 py-3 text-sm font-bold text-paper transition hover:bg-ledger-strong active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-2 sm:justify-self-end"
            >
              <PaperPlaneTilt size={18} /> {sending ? 'Enviando…' : 'Enviar mensagem'}
            </button>
            <p className="text-center text-xs text-ink-soft sm:col-span-2 sm:text-right">
              Prefere usar seu aplicativo de e-mail?{' '}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-bold text-ledger-strong hover:underline dark:text-ledger">
                Escrever diretamente
              </a>
            </p>
          </form>
        </section>

        {!user && (
          <p className="mt-6 text-center text-sm text-ink-soft">
            Problema somente com a senha?{' '}
            <Link to="/recuperar-conta" className="font-bold text-ledger-strong hover:underline dark:text-ledger">
              Recuperar minha conta
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
