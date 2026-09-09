import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ArrowClockwise, WarningCircle } from '@phosphor-icons/react';
import { captureFrontendError } from '../lib/observability';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
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

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center text-ink">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stamp/10 text-stamp">
          <WarningCircle size={28} weight="fill" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold">Algo deu errado</h1>
          <p className="mt-1 max-w-sm text-sm text-ink-soft">
            Um erro inesperado aconteceu. Seus dados continuam salvos neste aparelho — recarregar a página costuma
            resolver.
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-lg bg-ledger px-5 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong active:scale-[0.98]"
        >
          <ArrowClockwise size={18} /> Recarregar
        </button>
      </div>
    );
  }
}
