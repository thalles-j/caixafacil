import { Component, useEffect, useId, useRef, type ErrorInfo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

const pilhaDeModais: symbol[] = [];
let quantidadeBloqueiosDeRolagem = 0;
let overflowOriginalDoBody = '';

class ModalContentErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro no conteúdo do modal:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="rounded-xl border border-stamp/30 bg-stamp/10 p-4 text-center" role="alert">
        <p className="text-sm font-semibold text-stamp">Não foi possível abrir este conteúdo.</p>
        <p className="mt-1 text-xs text-ink-soft">Feche a janela e tente novamente.</p>
        <button
          type="button"
          onClick={this.props.onClose}
          className="mt-3 rounded-lg bg-stamp px-4 py-2 text-xs font-bold text-paper"
        >
          Fechar modal
        </button>
      </div>
    );
  }
}

export default function Modal({ open, onClose, title, children }: ModalProps) {
  const titleId = useId();
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(Symbol('modal'));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const modalId = modalIdRef.current;
    if (quantidadeBloqueiosDeRolagem === 0) {
      overflowOriginalDoBody = document.body.style.overflow;
    }
    quantidadeBloqueiosDeRolagem += 1;
    document.body.style.overflow = 'hidden';
    pilhaDeModais.push(modalId);

    const fecharComEscape = (event: KeyboardEvent) => {
      const modalNoTopo = pilhaDeModais[pilhaDeModais.length - 1];
      if (event.key === 'Escape' && modalNoTopo === modalId) {
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', fecharComEscape);
    return () => {
      document.removeEventListener('keydown', fecharComEscape);
      const indiceNaPilha = pilhaDeModais.lastIndexOf(modalId);
      if (indiceNaPilha >= 0) pilhaDeModais.splice(indiceNaPilha, 1);

      quantidadeBloqueiosDeRolagem = Math.max(0, quantidadeBloqueiosDeRolagem - 1);
      if (quantidadeBloqueiosDeRolagem === 0) {
        document.body.style.overflow = overflowOriginalDoBody;
      }
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-overlay active"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Janela de diálogo'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 flex h-8 w-8 items-center justify-center rounded-full bg-line/50 text-ink-soft transition hover:bg-line hover:text-ink"
          aria-label="Fechar"
          title="Fechar"
          type="button"
        >
          <X size={18} />
        </button>
        {title && <h2 id={titleId} className="mb-4 text-xl font-bold">{title}</h2>}
        <ModalContentErrorBoundary onClose={onClose}>{children}</ModalContentErrorBoundary>
      </div>
    </div>,
    document.body,
  );
}
