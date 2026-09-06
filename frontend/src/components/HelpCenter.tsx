import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  BookOpenText,
  CaretRight,
  CheckCircle,
  CursorClick,
  Lightbulb,
  ListNumbers,
  MagnifyingGlass,
  Question,
  X,
} from '@phosphor-icons/react';
import { filterHelpTopics, helpTopics, type HelpTopic, type TutorialHelpTopic } from '../lib/helpContent';

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('hidden'));
}

export default function HelpCenter() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const filteredTopics = useMemo(() => filterHelpTopics(query), [query]);
  const explanations = filteredTopics.filter((topic) => topic.kind === 'explanation');
  const tutorials = filteredTopics.filter((topic) => topic.kind === 'tutorial');

  const focusSearch = () => {
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const openHelp = () => {
    setSelectedTopic(null);
    setStepIndex(0);
    setOpen(true);
  };

  const closeHelp = () => {
    setOpen(false);
    setQuery('');
    setSelectedTopic(null);
    setStepIndex(0);
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const returnHome = () => {
    setSelectedTopic(null);
    setStepIndex(0);
    focusSearch();
  };

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    focusSearch();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeHelp();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) return;
      const elements = focusableElements(panelRef.current);
      if (elements.length === 0) return;

      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const chooseTopic = (topic: HelpTopic) => {
    setSelectedTopic(topic);
    setStepIndex(0);
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('[data-help-heading]')?.focus());
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openHelp}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-line/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised"
        aria-label="Ajuda"
        title="Abrir ajuda"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Question size={20} weight="bold" />
      </button>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex bg-ink/45 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeHelp();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="flex h-full w-full flex-col overflow-hidden bg-paper-raised text-ink shadow-2xl sm:h-[min(760px,calc(100vh-2rem))] sm:max-w-xl sm:rounded-3xl sm:border sm:border-line"
          >
            <header className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3 sm:px-5 sm:py-4">
              {selectedTopic ? (
                <button
                  type="button"
                  onClick={returnHome}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-line/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger"
                  aria-label="Voltar à busca"
                  title="Voltar à busca"
                >
                  <ArrowLeft size={20} />
                </button>
              ) : (
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-ledger text-paper">
                  <Question size={20} weight="bold" aria-hidden="true" />
                </span>
              )}

              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="truncate font-display text-lg font-bold text-ink sm:text-xl">
                  {selectedTopic ? selectedTopic.title : 'Como podemos ajudar?'}
                </h2>
                <p className="truncate text-xs text-ink-soft">
                  {selectedTopic
                    ? selectedTopic.kind === 'tutorial'
                      ? 'Tutorial prático'
                      : 'Explicação rápida'
                    : 'Busque uma dúvida ou escolha um tópico'}
                </p>
              </div>

              <button
                type="button"
                onClick={closeHelp}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-soft transition hover:bg-line/50 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger"
                aria-label="Fechar ajuda"
                title="Fechar ajuda"
              >
                <X size={20} />
              </button>
            </header>

            {selectedTopic ? (
              selectedTopic.kind === 'explanation' ? (
                <ExplanationView topic={selectedTopic} onBack={returnHome} />
              ) : (
                <TutorialView
                  topic={selectedTopic}
                  stepIndex={stepIndex}
                  onStepChange={setStepIndex}
                  onBack={returnHome}
                  onClose={closeHelp}
                />
              )
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-paper-raised px-4 pb-3 pt-4 sm:px-5">
                  <label htmlFor={`${titleId}-search`} className="sr-only">
                    Buscar na ajuda
                  </label>
                  <div className="relative">
                    <MagnifyingGlass
                      size={20}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft"
                      aria-hidden="true"
                    />
                    <input
                      ref={searchRef}
                      id={`${titleId}-search`}
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Ex.: vender fiado ou fechar o caixa"
                      className="w-full rounded-xl border border-line bg-paper py-3 pl-11 pr-10 text-sm text-ink outline-none transition placeholder:text-ink-soft/70 focus:border-ledger focus:ring-2 focus:ring-ledger/20"
                    />
                    {query && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuery('');
                          searchRef.current?.focus();
                        }}
                        className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-soft hover:bg-line/50 hover:text-ink"
                        aria-label="Limpar busca"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-ink-soft" aria-live="polite">
                    {query
                      ? `${filteredTopics.length} ${filteredTopics.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}`
                      : `${helpTopics.length} tópicos para ajudar no dia a dia`}
                  </p>
                </div>

                <div className="space-y-7 px-4 pb-6 sm:px-5">
                  {filteredTopics.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line bg-paper p-6 text-center">
                      <MagnifyingGlass size={30} className="mx-auto text-ink-soft" aria-hidden="true" />
                      <h3 className="mt-3 font-display font-bold text-ink">Nenhum tópico encontrado</h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                        Tente outra palavra, como “venda”, “caixa”, “relatório” ou “cliente”.
                      </p>
                    </div>
                  ) : (
                    <>
                      {explanations.length > 0 && (
                        <TopicSection
                          title="Entenda o CaixaFácil"
                          description="Respostas curtas para dúvidas comuns"
                          topics={explanations}
                          onChoose={chooseTopic}
                        />
                      )}
                      {tutorials.length > 0 && (
                        <TopicSection
                          title="Aprenda fazendo"
                          description="Passo a passo para concluir uma tarefa"
                          topics={tutorials}
                          onChoose={chooseTopic}
                        />
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function TopicSection({
  title,
  description,
  topics,
  onChoose,
}: {
  title: string;
  description: string;
  topics: HelpTopic[];
  onChoose: (topic: HelpTopic) => void;
}) {
  return (
    <section aria-labelledby={`help-section-${topics[0]?.kind}`}>
      <div className="mb-3">
        <h3 id={`help-section-${topics[0]?.kind}`} className="font-display text-base font-bold text-ink">
          {title}
        </h3>
        <p className="text-xs text-ink-soft">{description}</p>
      </div>
      <ul className="space-y-2">
        {topics.map((topic) => (
          <li key={topic.id}>
            <button
              type="button"
              onClick={() => onChoose(topic)}
              className="group flex w-full items-center gap-3 rounded-2xl border border-line bg-paper p-3 text-left transition hover:border-ledger/40 hover:bg-ledger/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger"
            >
              <span
                className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  topic.kind === 'tutorial'
                    ? 'bg-brass/10 text-brass'
                    : 'bg-ledger/10 text-ledger-strong dark:text-ledger'
                }`}
              >
                {topic.kind === 'tutorial' ? (
                  <ListNumbers size={21} weight="duotone" aria-hidden="true" />
                ) : (
                  <BookOpenText size={21} weight="duotone" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{topic.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{topic.summary}</span>
              </span>
              <CaretRight
                size={17}
                className="shrink-0 text-ink-soft transition group-hover:translate-x-0.5 group-hover:text-ledger"
                aria-hidden="true"
              />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ExplanationView({ topic, onBack }: { topic: HelpTopic & { kind: 'explanation' }; onBack: () => void }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 sm:py-8">
      <article className="mx-auto max-w-lg">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-ledger/10 text-ledger-strong dark:text-ledger">
          <BookOpenText size={29} weight="duotone" aria-hidden="true" />
        </span>
        <h3
          data-help-heading
          tabIndex={-1}
          className="mt-5 font-display text-2xl font-bold leading-tight text-ink outline-none"
        >
          {topic.title}
        </h3>
        <p className="mt-4 text-base leading-7 text-ink-soft">{topic.content}</p>

        <button
          type="button"
          onClick={onBack}
          className="mt-8 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-ledger px-4 py-3 text-sm font-bold text-paper transition hover:bg-ledger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised sm:w-auto"
        >
          <ArrowLeft size={18} /> Voltar à busca
        </button>
      </article>
    </div>
  );
}

function TutorialView({
  topic,
  stepIndex,
  onStepChange,
  onBack,
  onClose,
}: {
  topic: TutorialHelpTopic;
  stepIndex: number;
  onStepChange: (step: number) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const step = topic.steps[stepIndex];
  const isLast = stepIndex === topic.steps.length - 1;
  const progress = ((stepIndex + 1) / topic.steps.length) * 100;

  const changeStep = (nextStep: number) => {
    onStepChange(nextStep);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-help-heading]')?.focus());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 border-b border-line px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-3 text-xs font-semibold">
          <span className="font-ledger uppercase tracking-wide text-brass">
            Passo {stepIndex + 1} de {topic.steps.length}
          </span>
          <span className="text-ink-soft">{Math.round(progress)}%</span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Progresso do tutorial"
          aria-valuemin={1}
          aria-valuemax={topic.steps.length}
          aria-valuenow={stepIndex + 1}
        >
          <div className="h-full rounded-full bg-brass transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
        <article className="mx-auto max-w-lg">
          <h3
            data-help-heading
            tabIndex={-1}
            className="font-display text-2xl font-bold leading-tight text-ink outline-none"
          >
            {step.title}
          </h3>
          <p className="mt-3 text-base leading-7 text-ink-soft">{step.description}</p>

          <aside className="mt-5 rounded-2xl border border-brass/25 bg-brass/10 p-4" aria-label="Exemplo prático">
            <div className="flex items-center gap-2 text-brass">
              <Lightbulb size={19} weight="fill" aria-hidden="true" />
              <p className="text-[10px] font-bold uppercase tracking-[0.15em]">Exemplo prático</p>
            </div>
            <h4 className="mt-2 font-display text-sm font-bold text-ink">{topic.example.title}</h4>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">{topic.example.situation}</p>
            <div className="mt-3 border-t border-brass/20 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brass">Resultado esperado</p>
              <p className="mt-1 text-xs leading-5 text-ink">{topic.example.expectedResult}</p>
            </div>
          </aside>

          {/* Espaço preparado para receber uma captura real da tela em uma versão futura. */}
          <div className="mt-6 flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-paper p-5 text-center">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brass/10 text-brass">
              <CursorClick size={25} weight="duotone" aria-hidden="true" />
            </span>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.15em] text-ink-soft">Onde encontrar</p>
            <p className="mt-1 max-w-sm text-sm font-semibold leading-relaxed text-ink">{step.location}</p>
          </div>

          {isLast && (
            <div className="mt-5 flex items-start gap-3 rounded-2xl bg-ledger/10 p-4 text-ledger-strong dark:text-ledger">
              <CheckCircle size={22} weight="fill" className="mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold">Tutorial concluído</p>
                <p className="mt-1 text-xs leading-relaxed">Você pode voltar à busca para ver outro tópico ou fechar a ajuda.</p>
              </div>
            </div>
          )}
        </article>
      </div>

      <footer className="shrink-0 border-t border-line bg-paper-raised px-4 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto flex max-w-lg gap-3">
          <button
            type="button"
            onClick={() => changeStep(stepIndex - 1)}
            disabled={stepIndex === 0}
            className="flex-1 rounded-xl border border-line bg-paper px-4 py-3 text-sm font-semibold text-ink transition hover:bg-line/30 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger"
          >
            Anterior
          </button>
          <button
            type="button"
            onClick={() => (isLast ? onBack() : changeStep(stepIndex + 1))}
            className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-ledger px-4 py-3 text-sm font-bold text-paper transition hover:bg-ledger-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ledger focus-visible:ring-offset-2 focus-visible:ring-offset-paper-raised"
          >
            {isLast ? 'Voltar à busca' : 'Próximo'}
            {!isLast && <CaretRight size={17} weight="bold" aria-hidden="true" />}
          </button>
        </div>
        {isLast && (
          <button type="button" onClick={onClose} className="mx-auto mt-3 block text-xs font-semibold text-ink-soft underline hover:text-ink">
            Fechar ajuda
          </button>
        )}
      </footer>
    </div>
  );
}
