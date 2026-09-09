import { ArrowLeft, House, Moon, Storefront, Sun } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { useDarkMode } from '../lib/theme';

export default function NotFound() {
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6 py-10 text-ink">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-28 -top-28 h-72 w-72 rounded-full bg-ledger/10 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-brass/10 blur-3xl"
      />

      <div className="relative w-full max-w-lg">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ledger text-paper shadow-sm">
              <Storefront size={19} weight="fill" />
            </div>
            <span className="font-ledger text-xs font-bold uppercase tracking-[0.16em] text-ledger-strong dark:text-ledger">
              CaixaFácil
            </span>
          </div>
          <button
            type="button"
            onClick={() => setDark(!dark)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-paper-raised text-ink-soft shadow-sm transition hover:border-ledger hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
            aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            title={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
          >
            {dark ? <Sun size={19} /> : <Moon size={19} />}
          </button>
        </div>

        <section className="rounded-3xl border border-line bg-paper-raised p-7 shadow-xl shadow-ink/5 sm:p-10">
          <p className="font-ledger text-7xl font-bold leading-none text-ledger sm:text-8xl">404</p>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Página não encontrada
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
            A página que você tentou acessar não existe ou foi movida. Confira o endereço ou volte para um lugar
            conhecido.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-bold text-ink-soft transition hover:border-ledger hover:text-ledger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised"
            >
              <ArrowLeft size={18} weight="bold" />
              Voltar
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ledger px-5 py-3 text-sm font-bold text-paper shadow-sm transition hover:bg-ledger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised active:scale-[0.98]"
            >
              <House size={18} weight="bold" />
              Ir para o início
            </button>
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-ink-soft">Código do erro: rota não encontrada</p>
      </div>
    </main>
  );
}
