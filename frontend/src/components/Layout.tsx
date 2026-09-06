import { useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Bell, GearSix, Moon, Sun } from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { getCategoryTheme } from '../lib/categoryThemes';
import { formatCurrency, todayISO } from '../lib/format';
import { useDarkMode } from '../lib/theme';
import type { Conta } from '../types';
import BottomNav from './BottomNav';
import FabButton from './FabButton';
import HelpCenter from './HelpCenter';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});

const PRIVACY_STORAGE_KEY = 'facilites-hide-sensitive-information';

export type LayoutOutletContext = {
  informacoesVisiveis: boolean;
  alternarInformacoes: () => void;
};

export default function Layout() {
  const { data, totalNotificacoes, contasVencidas, contasVencendoEmBreve } = useAppData();
  const navigate = useNavigate();
  const [dark, setDark] = useDarkMode();
  const [informacoesVisiveis, setInformacoesVisiveis] = useState(
    () => window.localStorage.getItem(PRIVACY_STORAGE_KEY) !== 'true',
  );
  const [notificacoesAbertas, setNotificacoesAbertas] = useState(false);
  const notificacoesRef = useRef<HTMLDivElement>(null);
  const hoje = dateFormatter.format(new Date()).replace('-feira', '');
  const hojeISO = todayISO();
  const theme = getCategoryTheme(data.config?.categoria);
  const Icon = theme.icon;

  useEffect(() => {
    if (!notificacoesAbertas) return;
    const handleClickFora = (e: MouseEvent) => {
      if (notificacoesRef.current && !notificacoesRef.current.contains(e.target as Node)) {
        setNotificacoesAbertas(false);
      }
    };
    document.addEventListener('mousedown', handleClickFora);
    return () => document.removeEventListener('mousedown', handleClickFora);
  }, [notificacoesAbertas]);

  useEffect(() => {
    window.localStorage.setItem(PRIVACY_STORAGE_KEY, String(!informacoesVisiveis));
  }, [informacoesVisiveis]);

  const alternarInformacoes = () => {
    if (informacoesVisiveis) setNotificacoesAbertas(false);
    setInformacoesVisiveis((visiveis) => !visiveis);
  };

  const itensNotificacao: { conta: Conta; atrasada: boolean }[] = [
    ...contasVencidas.map((conta) => ({ conta, atrasada: true })),
    ...contasVencendoEmBreve.map((conta) => ({ conta, atrasada: false })),
  ];

  const irParaConta = (conta: Conta) => {
    setNotificacoesAbertas(false);
    navigate(conta.tipo === 'pagar' ? '/financas?tab=pagar' : '/financas?tab=receber');
  };

  return (
    <div className="min-h-screen bg-paper font-body text-ink md:flex">
      <BottomNav informacoesVisiveis={informacoesVisiveis} />

      <div className="flex min-w-0 flex-1 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-40 border-b border-line bg-paper-raised/95 px-4 py-3 backdrop-blur-sm">
          <div className="mx-auto flex max-w-md items-center justify-between sm:max-w-xl lg:max-w-5xl">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-paper"
                style={{ backgroundColor: theme.accent }}
              >
                <Icon size={18} weight="fill" />
              </div>
              <div className="min-w-0">
                <h1 className="min-w-0 truncate font-display text-lg font-semibold leading-tight text-ink sm:text-xl">
                  {data.config?.nome ?? 'Meu Negócio'}
                </h1>
                <p className="truncate text-xs capitalize text-ink-soft">{hoje}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setDark(!dark)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-line/50 hover:text-ink"
                aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
                title={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <HelpCenter />
              <button
                onClick={() => navigate('/configuracoes')}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-line/50 hover:text-ink"
                aria-label="Configurações"
                title="Abrir configurações"
              >
                <GearSix size={20} />
              </button>
              {informacoesVisiveis && <div className="relative" ref={notificacoesRef}>
                <button
                  onClick={() => setNotificacoesAbertas((v) => !v)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition hover:bg-line/50 hover:text-ink"
                  aria-label="Notificações"
                  aria-expanded={notificacoesAbertas}
                  title="Abrir notificações"
                >
                  <span className="relative inline-flex">
                    <Bell size={20} weight={notificacoesAbertas ? 'fill' : 'regular'} />
                    {totalNotificacoes > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border border-paper-raised bg-stamp px-1 font-ledger text-[9px] font-bold leading-none text-paper">
                        {totalNotificacoes}
                      </span>
                    )}
                  </span>
                </button>

                {notificacoesAbertas && (
                  <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-line bg-paper-raised shadow-lg">
                    <div className="border-b border-line px-4 py-3">
                      <h2 className="font-display text-sm font-bold text-ink">Atenção Necessária</h2>
                    </div>
                    {itensNotificacao.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-ink-soft">Nenhuma pendência no momento.</p>
                    ) : (
                      <ul className="max-h-80 divide-y divide-line overflow-y-auto">
                        {itensNotificacao.map(({ conta, atrasada }) => {
                          const dias = Math.round(
                            (new Date(`${conta.vencimento}T00:00:00`).getTime() -
                              new Date(`${hojeISO}T00:00:00`).getTime()) /
                              86_400_000,
                          );
                          return (
                            <li key={conta.id}>
                              <button
                                onClick={() => irParaConta(conta)}
                                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-line/30"
                              >
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-ink">{conta.descricao}</p>
                                  <p className={`text-xs font-medium ${atrasada ? 'text-stamp' : 'text-brass'}`}>
                                    {atrasada ? 'Atrasada' : `Vence em ${dias} dia${dias > 1 ? 's' : ''}`} —{' '}
                                    {conta.tipo === 'pagar' ? 'a pagar' : 'a receber'}
                                  </p>
                                </div>
                                <span className="shrink-0 font-ledger text-sm font-bold tabular-nums text-ink">
                                  {formatCurrency(conta.valor)}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>}
            </div>
          </div>
        </header>

        <main className="relative mx-auto w-full max-w-md flex-1 p-4 sm:max-w-xl lg:max-w-5xl">
          <Outlet
            context={{
              informacoesVisiveis,
              alternarInformacoes,
            } satisfies LayoutOutletContext}
          />
        </main>
      </div>

      <FabButton />
    </div>
  );
}
