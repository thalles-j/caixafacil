import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUp,
  Calculator,
  ChartBar,
  CaretDown,
  CaretUp,
  ClipboardText,
  Eye,
  EyeSlash,
  FilePdf,
  HandCoins,
  Headset,
  Package,
  Receipt,
  ShieldCheck,
  Moon,
  Sparkle,
  Storefront,
  Sun,
  TrendUp,
} from '@phosphor-icons/react';
import { getCategoryTheme } from '../lib/categoryThemes';
import { useDarkMode } from '../lib/theme';
import { RAMOS_ATUACAO } from '../types';

const RECURSOS = [
  {
    icon: Calculator,
    tone: 'ledger' as const,
    titulo: 'Frente de caixa',
    descricao: 'Registre produtos e serviços em dinheiro, Pix, cartão ou fiado com poucos toques.',
  },
  {
    icon: Package,
    tone: 'brass' as const,
    titulo: 'Catálogo completo',
    descricao: 'Cadastre produtos e serviços com preço, categorias e controle do que está acabando.',
  },
  {
    icon: HandCoins,
    tone: 'stamp' as const,
    titulo: 'Contas e fiado',
    descricao: 'Acompanhe despesas fixas, dê baixa nos pagamentos e saiba quem ainda está devendo.',
  },
  {
    icon: ChartBar,
    tone: 'ledger' as const,
    titulo: 'Painel do dia',
    descricao: 'Veja saldo, entradas, despesas, metas e alertas importantes assim que abrir o app.',
  },
  {
    icon: ClipboardText,
    tone: 'brass' as const,
    titulo: 'Pendências organizadas',
    descricao: 'Revise entradas e despesas sem identificação antes de concluir a conferência do caixa.',
  },
  {
    icon: Receipt,
    tone: 'stamp' as const,
    titulo: 'Fechamento diário',
    descricao: 'Confira todas as entradas e saídas, resolva pendências e conte o dinheiro em uma página própria.',
  },
  {
    icon: FilePdf,
    tone: 'ledger' as const,
    titulo: 'Relatórios completos',
    descricao: 'Escolha dia, semana ou mês, analise produtos e movimentações e salve o relatório em PDF.',
  },
  {
    icon: ShieldCheck,
    tone: 'brass' as const,
    titulo: 'Modo privacidade',
    descricao: 'Oculte valores, alertas, movimentações e atalhos sensíveis quando houver alguém por perto.',
  },
];

const toneClasses: Record<'ledger' | 'brass' | 'stamp', string> = {
  ledger: 'bg-ledger/10 text-ledger-strong dark:text-ledger',
  brass: 'bg-brass/10 text-brass',
  stamp: 'bg-stamp/10 text-stamp',
};

export default function Landing() {
  const [dark, setDark] = useDarkMode();
  const [valoresDemonstracaoVisiveis, setValoresDemonstracaoVisiveis] = useState(true);
  const [recursosExpandidos, setRecursosExpandidos] = useState(false);
  const [ramosExpandidos, setRamosExpandidos] = useState(false);

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-line bg-paper/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ledger text-paper">
              <Storefront size={16} weight="fill" />
            </div>
            <span className="font-display text-base font-semibold">CaixaFácil</span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-4">
            <a
              href="#recursos"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById('recursos')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="hidden text-sm font-medium text-ink-soft hover:text-ink sm:inline"
            >
              Recursos
            </a>
            <button
              type="button"
              onClick={() => setDark(!dark)}
              aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              title={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line bg-paper-raised text-ink-soft transition hover:border-ink-soft hover:text-ink"
            >
              {dark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              to="/suporte"
              aria-label="Suporte"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-2 text-sm font-medium text-ink-soft transition hover:bg-line/40 hover:text-ink sm:px-3"
            >
              <Headset size={18} /> <span className="hidden md:inline">Suporte</span>
            </Link>
            <Link to="/login" className="text-sm font-medium text-ink-soft hover:text-ink">
              Entrar
            </Link>
            <Link
              to="/cadastro"
              className="rounded-lg bg-ledger px-3.5 py-2 text-sm font-semibold text-paper transition hover:bg-ledger-strong"
            >
              Começar agora
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-2 lg:items-center lg:gap-16 lg:py-24">
          <div className="min-w-0">
            <span className="inline-block rounded-full bg-ledger/10 px-3 py-1 font-ledger text-[11px] font-semibold uppercase tracking-wide text-ledger-strong dark:text-ledger">
              Para quem vende no dia a dia
            </span>
            <h1 className="mt-4 font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
              Seu negócio inteiro, numa página só.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-soft sm:text-lg">
              Venda, controle o fiado, acompanhe despesas e feche o caixa com relatório — tudo num só app, simples
              como uma caderneta e sem curso para aprender a usar.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/cadastro"
                className="flex items-center justify-center gap-2 rounded-xl bg-ledger px-6 py-3.5 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong active:scale-[0.98]"
              >
                Começar agora <ArrowRight size={18} weight="bold" />
              </Link>
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 rounded-xl border border-line px-6 py-3.5 text-sm font-bold text-ink transition hover:border-ink-soft"
              >
                Já uso, entrar
              </Link>
            </div>
            <p className="mt-4 text-xs text-ink-soft">Grátis no protótipo · seus dados ficam protegidos na sua conta.</p>
          </div>

          {/* Mock do painel — a mesma "recibo" que aparece dentro do app */}
          <div className="relative mx-auto w-full min-w-0 max-w-sm">
            <div className="receipt-edge rounded-2xl bg-[#241a12] px-5 pb-8 pt-6 text-[#f7f1e4] shadow-xl">
              <div className="mb-5 flex items-start justify-between">
                <div>
                  <p className="mb-1 font-ledger text-[10px] font-semibold uppercase tracking-[0.2em] text-[#f7f1e4]/70">
                    Caixa Disponível
                  </p>
                  <h2 className="font-display text-3xl font-semibold tracking-tight">
                    {valoresDemonstracaoVisiveis ? 'R$ 1.284,90' : 'R$ ••••••'}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setValoresDemonstracaoVisiveis((visiveis) => !visiveis)}
                  aria-label={valoresDemonstracaoVisiveis ? 'Ocultar valores da demonstração' : 'Mostrar valores da demonstração'}
                  title={valoresDemonstracaoVisiveis ? 'Ocultar informações' : 'Mostrar informações'}
                  className="privacy-nudge flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f7f1e4]/10 transition hover:bg-[#f7f1e4]/20"
                >
                  {valoresDemonstracaoVisiveis ? <Eye size={18} /> : <EyeSlash size={18} />}
                </button>
              </div>
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl border border-[#f7f1e4]/15 bg-[#f7f1e4]/10 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="font-ledger text-[11px] font-bold uppercase tracking-wide text-[#f7f1e4]/80">Vendas Hoje</p>
                    <TrendUp size={14} weight="fill" className="text-[#7fd9ab]" />
                  </div>
                  <p className="font-ledger text-base font-semibold tabular-nums">
                    {valoresDemonstracaoVisiveis ? 'R$ 342,00' : 'R$ ••••••'}
                  </p>
                </div>
                <div className="flex-1 rounded-xl border border-[#f7f1e4]/15 bg-[#f7f1e4]/10 p-3">
                  <p className="mb-1 font-ledger text-[11px] font-bold uppercase tracking-wide text-[#f7f1e4]/80">Despesas Hoje</p>
                  <p className="font-ledger text-base font-semibold tabular-nums">
                    {valoresDemonstracaoVisiveis ? 'R$ 96,50' : 'R$ ••••••'}
                  </p>
                </div>
              </div>
            </div>
            <span className="stamp absolute -right-3 -top-3 bg-paper-raised text-ledger-strong shadow-md dark:text-ledger">
              <ArrowUp size={12} weight="bold" /> em dia
            </span>
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="scroll-mt-16 border-t border-line bg-paper-raised/50 py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">O que ele resolve</h2>
            <p className="mt-2 max-w-xl text-sm text-ink-soft">
              Um fluxo completo para trabalhar durante o dia e fechar o caixa sem depender de planilhas.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {RECURSOS.map(({ icon: Icon, tone, titulo, descricao }, indice) => (
                <div
                  key={titulo}
                  className={`${!recursosExpandidos && indice >= 3 ? 'hidden sm:block' : ''} rounded-2xl border border-line bg-paper-raised p-5 shadow-sm`}
                >
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${toneClasses[tone]}`}>
                    <Icon size={20} />
                  </div>
                  <h3 className="font-display text-base font-semibold">{titulo}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{descricao}</p>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRecursosExpandidos((aberto) => !aberto)}
              aria-expanded={recursosExpandidos}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-paper-raised px-4 py-3 text-sm font-bold text-ink shadow-sm sm:hidden"
            >
              {recursosExpandidos ? 'Mostrar menos funcionalidades' : `Ver todas as ${RECURSOS.length} funcionalidades`}
              {recursosExpandidos ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
            </button>
          </div>
        </section>

        {/* Para quem é */}
        <section className="py-16">
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-2xl font-semibold sm:text-3xl">Feito para quem trabalha por conta</h2>
            <p className="mt-2 max-w-xl text-sm text-ink-soft">
              De lojas e salões a motoristas e prestadores de serviço: o app adapta o visual ao seu ramo.
            </p>
            <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {RAMOS_ATUACAO.map((ramo, indice) => {
                const theme = getCategoryTheme(ramo);
                const Icon = theme.icon;
                return (
                  <div
                    key={ramo}
                    className={`${!ramosExpandidos && indice >= 6 ? 'hidden sm:flex' : 'flex'} flex-col items-center gap-2 rounded-2xl border border-line bg-paper-raised p-4 text-center shadow-sm`}
                  >
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-paper"
                      style={{ backgroundColor: theme.accent }}
                    >
                      <Icon size={20} weight="fill" />
                    </div>
                    <span className="text-xs font-medium leading-tight text-ink">{ramo}</span>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setRamosExpandidos((aberto) => !aberto)}
              aria-expanded={ramosExpandidos}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-line bg-paper-raised px-4 py-3 text-sm font-bold text-ink shadow-sm sm:hidden"
            >
              {ramosExpandidos ? 'Mostrar menos categorias' : `Ver todas as ${RAMOS_ATUACAO.length} categorias`}
              {ramosExpandidos ? <CaretUp size={16} weight="bold" /> : <CaretDown size={16} weight="bold" />}
            </button>
          </div>
        </section>

        {/* Confiança */}
        <section className="border-y border-line bg-paper-raised/50 py-14">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 sm:grid-cols-3">
            <TrustPoint icon={Storefront} titulo="Feito para o dia a dia" descricao="Pensado para loja, salão, oficina, motorista e prestador de serviço independente." />
            <TrustPoint icon={ShieldCheck} titulo="Dados protegidos" descricao="Seu negócio fica vinculado à sua conta e sua sessão continua ativa com segurança." />
            <TrustPoint icon={Sparkle} titulo="Sem mensalidade no protótipo" descricao="Experimente sem cadastrar cartão. É um protótipo em evolução." />
          </div>
        </section>

        {/* CTA final */}
        <section className="bg-[#241a12] py-16 text-[#f7f1e4]">
          <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-5 text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Pronto para tirar a caderneta do papel?
            </h2>
            <p className="max-w-md text-sm text-[#f7f1e4]/70 sm:text-base">
              Leva menos de dois minutos para configurar seu negócio e começar a registrar vendas hoje.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <Link
                to="/cadastro"
                className="flex items-center justify-center gap-2 rounded-xl bg-ledger px-6 py-3.5 text-sm font-bold text-paper shadow-md transition hover:bg-ledger-strong active:scale-[0.98]"
              >
                Começar agora <ArrowRight size={18} weight="bold" />
              </Link>
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 rounded-xl border border-[#f7f1e4]/30 px-6 py-3.5 text-sm font-bold text-[#f7f1e4] transition hover:border-[#f7f1e4]/60"
              >
                Já uso, entrar
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line py-6">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-5 text-center text-xs text-ink-soft sm:flex-row sm:justify-between sm:text-left">
          <span>CaixaFácil — protótipo 1.0</span>
          <div className="flex items-center gap-4">
            <Link to="/suporte" className="font-medium text-ink-soft hover:text-ink">Suporte</Link>
            <Link to="/login" className="font-medium text-ink-soft hover:text-ink">Entrar</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function TrustPoint({
  icon: Icon,
  titulo,
  descricao,
}: {
  icon: typeof Storefront;
  titulo: string;
  descricao: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 text-center sm:items-start sm:text-left">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ledger/10 text-ledger-strong dark:text-ledger">
        <Icon size={20} />
      </div>
      <h3 className="font-display text-base font-semibold">{titulo}</h3>
      <p className="text-sm leading-relaxed text-ink-soft">{descricao}</p>
    </div>
  );
}
