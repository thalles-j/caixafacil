import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ArrowClockwise, House, Moon, Storefront, Sun, WarningCircle } from '@phosphor-icons/react';
import { captureFrontendError } from '../lib/observability';
import { useDarkMode } from '../lib/theme';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

function ErrorScreen() {
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
          <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl bg-stamp/10 text-stamp">
            <WarningCircle size={34} weight="fill" />
          </div>
          <p className="mb-2 font-ledger text-xs font-bold uppercase tracking-[0.14em] text-stamp">
            Erro inesperado
          </p>
          <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
            Algo saiu do lugar
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-ink-soft sm:text-base">
            Não conseguimos carregar esta parte do CaixaFácil. Seus dados continuam salvos neste aparelho. Tente
            recarregar a página para continuar.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-ledger px-5 py-3 text-sm font-bold text-paper shadow-sm transition hover:bg-ledger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised active:scale-[0.98]"
            >
              <ArrowClockwise size={18} weight="bold" />
              Recarregar página
            </button>
            <a
              href="/"
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-line px-5 py-3 text-sm font-bold text-ink-soft transition hover:border-ledger hover:text-ledger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised"
            >
              <House size={18} weight="bold" />
              Ir para o início
            </a>
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-ink-soft">
          Se o problema continuar, aguarde alguns instantes e tente novamente.
        </p>
      </div>
    </main>
  );
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    captureFrontendError(error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return <ErrorScreen />;
  }
}
