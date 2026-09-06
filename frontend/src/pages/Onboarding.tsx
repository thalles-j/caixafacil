import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ArrowLeft,
  Buildings,
  Calculator,
  Check,
  Drop,
  GasPump,
  Lightning,
  Plus,
  Storefront,
  Trash,
  UsersThree,
  WifiHigh,
} from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { RAMOS_ATUACAO } from '../types';
import type { DespesaFixa, Oferta, Recorrencia, ViewPeriod } from '../types';
import { getCategoryTheme } from '../lib/categoryThemes';
import { formatCurrency, parseMoney, sanitizeMoneyInput } from '../lib/format';
import { uid } from '../lib/storage';

const TOTAL_STEPS = 4;

const OFERTAS: { valor: Oferta; label: string }[] = [
  { valor: 'ambos', label: 'Produtos e Serviços' },
  { valor: 'produtos', label: 'Apenas Produtos' },
  { valor: 'servicos', label: 'Apenas Serviços' },
];

const DESPESAS_SUGERIDAS = [
  { nome: 'Aluguel', Icon: Buildings },
  { nome: 'Energia', Icon: Lightning },
  { nome: 'Água', Icon: Drop },
  { nome: 'Internet', Icon: WifiHigh },
  { nome: 'Funcionários', Icon: UsersThree },
  { nome: 'Combustível', Icon: GasPump },
  { nome: 'Contabilidade', Icon: Calculator },
];

export default function Onboarding() {
  const { setConfig, cadastrarDespesaFixaNoBanco } = useAppData();
  const navigate = useNavigate();

  const [step, setStep] = useState(0);

  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<string>(RAMOS_ATUACAO[0]);
  const [oferta, setOferta] = useState<Oferta>('ambos');
  const [despesasFixas, setDespesasFixas] = useState<DespesaFixa[]>([]);
  const [novaDespesaNome, setNovaDespesaNome] = useState('');
  const [novaDespesaValor, setNovaDespesaValor] = useState('');
  const [novaDespesaRecorrencia, setNovaDespesaRecorrencia] = useState<Recorrencia>('mensal');
  const [viewPeriod, setViewPeriod] = useState<ViewPeriod>('day');
  const [resumoSemanal, setResumoSemanal] = useState(true);
  const [fechamentoMensal, setFechamentoMensal] = useState(true);
  const [concluindo, setConcluindo] = useState(false);
  const [conclusaoErro, setConclusaoErro] = useState<string | null>(null);

  const selecionarOferta = (valor: Oferta) => {
    setOferta(valor);
  };

  const adicionarDespesa = (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    const valor = parseMoney(novaDespesaValor);
    if (!novaDespesaNome.trim() || !valor || valor <= 0) return;
    setDespesasFixas((prev) => [
      ...prev,
      { id: uid(), nome: novaDespesaNome.trim(), valor, recorrencia: novaDespesaRecorrencia },
    ]);
    setNovaDespesaNome('');
    setNovaDespesaValor('');
  };

  const removerDespesa = (id: string) => {
    setDespesasFixas((prev) => prev.filter((d) => d.id !== id));
  };

  const totalMensalEstimado = despesasFixas.reduce(
    (total, despesa) => total + despesa.valor * (despesa.recorrencia === 'semanal' ? 4 : 1),
    0,
  );
  const podeAdicionarDespesa = novaDespesaNome.trim().length > 0 && parseMoney(novaDespesaValor) > 0;

  const podeAvancar = step !== 0 || nome.trim().length > 0;

  const avancar = () => {
    if (!podeAvancar) return;
    setStep((s) => Math.min(TOTAL_STEPS - 1, s + 1));
  };

  const voltar = () => setStep((s) => Math.max(0, s - 1));

  const concluir = async () => {
    const frequencia =
      resumoSemanal && fechamentoMensal
        ? 'ambos'
        : resumoSemanal
        ? 'semanal'
        : fechamentoMensal
        ? 'mensal'
        : 'nenhum';

    setConcluindo(true);
    setConclusaoErro(null);
    try {
      await setConfig({
        nome: nome.trim(),
        categoria,
        oferta,
        controlaEstoque: oferta !== 'servicos',
        despesasFixas: [],
        relatorio: { frequencia, porEmail: false },
        viewPeriod,
        onboardingConcluido: true,
      });
      for (const despesa of despesasFixas) {
        await cadastrarDespesaFixaNoBanco({
          nome: despesa.nome,
          valor: despesa.valor,
          recorrencia: despesa.recorrencia,
        });
      }
      navigate('/', { replace: true });
    } catch (error) {
      setConclusaoErro(error instanceof Error ? error.message : 'Não foi possível concluir a configuração.');
      setConcluindo(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center bg-[#241a12] px-6 py-8 text-[#f7f1e4]">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-[#f7f1e4] shadow-lg shadow-black/30">
        <Storefront size={38} weight="fill" className="text-ledger-strong" />
      </div>
      <h1 className="mb-1 text-center font-display text-2xl font-bold leading-tight tracking-tight">
        CaixaFácil
      </h1>
      <p className="mb-6 text-center font-ledger text-xs font-medium text-[#f7f1e4]/60">
        Passo {step + 1} de {TOTAL_STEPS}
      </p>

      <div className="mb-6 h-1.5 w-full max-w-sm rounded-full bg-[#f7f1e4]/15">
        <div
          className="h-1.5 rounded-full bg-ledger transition-all duration-300 ease-out"
          style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
        />
      </div>

      <div className="flex w-full max-w-sm flex-1 flex-col overflow-hidden rounded-[2rem] bg-paper-raised text-ink shadow-2xl">
        <div className="flex-1 overflow-y-auto p-6">
          {step === 0 && (
            <div className="fade-in space-y-5">
              <h2 className="font-display text-lg font-bold text-ink">Sua empresa</h2>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  Nome do Negócio
                </label>
                <input
                  type="text"
                  autoFocus
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex: Mercadinho da Esquina"
                  className="w-full border-b-2 border-line bg-transparent py-2 text-lg font-semibold text-ink placeholder-ink-soft/50 transition-colors focus:border-ledger focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  Categoria Principal
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {RAMOS_ATUACAO.map((ramo) => {
                    const theme = getCategoryTheme(ramo);
                    const Icon = theme.icon;
                    const selecionado = categoria === ramo;
                    return (
                      <button
                        key={ramo}
                        type="button"
                        onClick={() => setCategoria(ramo)}
                        aria-pressed={selecionado}
                        className={`selection-option flex flex-col items-center gap-2 rounded-2xl border-2 p-3 text-center ${
                          selecionado ? 'border-ledger bg-ledger/10' : 'border-line bg-paper'
                        }`}
                      >
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-xl text-paper"
                          style={{ backgroundColor: theme.accent }}
                        >
                          <Icon size={20} weight="fill" />
                        </div>
                        <span className="text-xs font-medium leading-tight text-ink">{ramo}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="fade-in space-y-5">
              <h2 className="font-display text-lg font-bold text-ink">Modelo de negócio</h2>
              <div className="space-y-2">
                {OFERTAS.map(({ valor, label }) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => selecionarOferta(valor)}
                    aria-pressed={oferta === valor}
                    className={`selection-option w-full rounded-xl border-2 px-4 py-3 text-left text-sm font-medium ${
                      oferta === valor ? 'border-ledger bg-ledger/10 text-ledger-strong' : 'border-line bg-paper text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="fade-in space-y-5">
              <div>
                <h2 className="font-display text-lg font-bold text-ink">Despesas que se repetem</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Cadastre aluguel, contas e outros gastos recorrentes para lembrar de dar baixa quando pagar. Esta etapa é opcional.
                </p>
              </div>

              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-soft">Escolha uma sugestão</p>
                <div className="grid grid-cols-2 gap-2">
                  {DESPESAS_SUGERIDAS.map(({ nome: sugestao, Icon }) => (
                    <button
                      key={sugestao}
                      type="button"
                      onClick={() => setNovaDespesaNome(sugestao)}
                      title={`Usar ${sugestao}`}
                      aria-pressed={novaDespesaNome === sugestao}
                      className={`selection-option flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold ${
                        novaDespesaNome === sugestao
                          ? 'border-ledger bg-ledger/10 text-ledger-strong'
                          : 'border-line bg-paper text-ink-soft hover:border-ledger/40 hover:text-ink'
                      }`}
                    >
                      <Icon size={17} className="shrink-0" /> {sugestao}
                    </button>
                  ))}
                </div>
              </div>

              <form onSubmit={adicionarDespesa} className="space-y-4 rounded-2xl border border-line bg-paper p-4">
                <h3 className="font-display text-sm font-bold text-ink">Adicionar despesa fixa</h3>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Nome da despesa</span>
                  <input
                    type="text"
                    value={novaDespesaNome}
                    onChange={(e) => setNovaDespesaNome(e.target.value)}
                    placeholder="Ex: Aluguel do ponto"
                    className="w-full rounded-xl border border-line bg-paper-raised px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-ink-soft">Valor de cada pagamento</span>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-ledger text-sm font-bold text-ink-soft">R$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={novaDespesaValor}
                      onChange={(e) => setNovaDespesaValor(sanitizeMoneyInput(e.target.value))}
                      placeholder="0,00"
                      className="w-full rounded-xl border border-line bg-paper-raised py-2.5 pl-10 pr-3 font-ledger text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ledger/30"
                    />
                  </div>
                </label>

                <fieldset>
                  <legend className="mb-2 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Com que frequência?</legend>
                  <div
                    data-choice-position={novaDespesaRecorrencia === 'semanal' ? 'second' : 'first'}
                    className="segmented-slider segmented-slider-2 grid grid-cols-2 rounded-xl bg-line/40 p-1"
                  >
                    {([
                      ['mensal', 'Todo mês'],
                      ['semanal', 'Toda semana'],
                    ] as const).map(([recorrencia, label]) => (
                      <button
                        key={recorrencia}
                        type="button"
                        aria-pressed={novaDespesaRecorrencia === recorrencia}
                        onClick={() => setNovaDespesaRecorrencia(recorrencia)}
                        className={`selection-option rounded-xl border px-3 py-2.5 text-xs font-semibold ${
                          novaDespesaRecorrencia === recorrencia
                            ? 'border-ledger bg-ledger/10 text-ledger-strong'
                            : 'border-line bg-paper-raised text-ink-soft'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <button
                  type="submit"
                  disabled={!podeAdicionarDespesa}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-ledger px-4 py-3 text-sm font-bold text-paper transition hover:bg-ledger-strong disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={17} weight="bold" /> Adicionar despesa
                </button>
              </form>

              {despesasFixas.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-4 py-5 text-center">
                  <p className="text-sm font-medium text-ink">Nenhuma despesa adicionada</p>
                  <p className="mt-1 text-xs text-ink-soft">Você pode continuar e cadastrar depois nas Configurações.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-wide text-ink-soft">Despesas adicionadas</p>
                      <p className="text-xs text-ink-soft">Semanais são estimadas em quatro pagamentos.</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">Estimativa mensal</p>
                      <p className="font-ledger text-sm font-bold text-stamp">{formatCurrency(totalMensalEstimado)}</p>
                    </div>
                  </div>
                  <ul className="space-y-2">
                    {despesasFixas.map((despesa) => (
                      <li key={despesa.id} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-paper p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink">{despesa.nome}</p>
                          <p className="mt-0.5 text-[10px] font-medium text-ink-soft">
                            {despesa.recorrencia === 'mensal' ? 'Pagamento mensal' : 'Pagamento semanal'}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="font-ledger text-sm font-bold tabular-nums text-ink">{formatCurrency(despesa.valor)}</span>
                          <button
                            type="button"
                            onClick={() => removerDespesa(despesa.id)}
                            aria-label={`Remover ${despesa.nome}`}
                            title={`Remover ${despesa.nome}`}
                            className="rounded-lg p-2 text-ink-soft transition hover:bg-stamp/10 hover:text-stamp"
                          >
                            <Trash size={16} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="fade-in space-y-5">
              <h2 className="font-display text-lg font-bold text-ink">Preferências</h2>
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  Painel Inicial mostra números de:
                </label>
                <div
                  data-choice-position={viewPeriod === 'week' ? 'second' : 'first'}
                  className="segmented-slider segmented-slider-2 grid grid-cols-2 rounded-xl bg-line/40 p-1"
                >
                  <button
                    type="button"
                    aria-pressed={viewPeriod === 'day'}
                    onClick={() => setViewPeriod('day')}
                    className={`selection-option flex-1 rounded-xl border-2 px-4 py-2 text-sm font-medium ${
                      viewPeriod === 'day' ? 'border-ledger bg-ledger/10 text-ledger-strong' : 'border-line bg-paper text-ink'
                    }`}
                  >
                    Dia Atual
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewPeriod === 'week'}
                    onClick={() => setViewPeriod('week')}
                    className={`selection-option flex-1 rounded-xl border-2 px-4 py-2 text-sm font-medium ${
                      viewPeriod === 'week' ? 'border-ledger bg-ledger/10 text-ledger-strong' : 'border-line bg-paper text-ink'
                    }`}
                  >
                    Semana
                  </button>
                </div>
                <p className="mt-2 text-xs text-ink-soft">
                  Define se os cartões de Vendas e Despesas no topo do Painel mostram o total de hoje ou dos
                  últimos 7 dias.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-bold uppercase tracking-wider text-ink-soft">
                  Relatórios Automáticos
                </label>
                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-paper p-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      Resumo Semanal
                      <span className="rounded-full bg-brass/15 px-2 py-0.5 font-ledger text-[9px] font-bold uppercase tracking-wide text-brass">
                        Em breve
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={resumoSemanal}
                      onChange={(e) => setResumoSemanal(e.target.checked)}
                      className="h-5 w-5 accent-ledger"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-xl bg-paper p-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink">
                      Fechamento Mensal
                      <span className="rounded-full bg-brass/15 px-2 py-0.5 font-ledger text-[9px] font-bold uppercase tracking-wide text-brass">
                        Em breve
                      </span>
                    </span>
                    <input
                      type="checkbox"
                      checked={fechamentoMensal}
                      onChange={(e) => setFechamentoMensal(e.target.checked)}
                      className="h-5 w-5 accent-ledger"
                    />
                  </label>
                  <p className="rounded-lg bg-brass/10 px-3 py-2 text-xs text-ink-soft">
                    <span className="font-semibold text-brass">Simulação:</span> nesta versão do protótipo, nenhum
                    e-mail ou notificação é enviado de verdade.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {conclusaoErro && <p className="px-4 pt-3 text-center text-xs font-medium text-stamp">{conclusaoErro}</p>}
        <div className="flex items-center gap-3 border-t border-line p-4">
          {step > 0 && (
            <button
              type="button"
              onClick={voltar}
              className="flex items-center gap-1 rounded-xl px-4 py-3 text-sm font-bold text-ink-soft transition hover:bg-line/30"
            >
              <ArrowLeft size={16} weight="bold" /> Voltar
            </button>
          )}
          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              onClick={avancar}
              disabled={!podeAvancar}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-bold text-paper shadow-md transition active:scale-95 ${
                podeAvancar ? 'bg-ledger hover:bg-ledger-strong' : 'cursor-not-allowed bg-ledger/40'
              }`}
            >
              Avançar <ArrowRight size={18} weight="bold" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void concluir()}
              disabled={concluindo}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-ledger py-3 font-bold text-paper shadow-md transition-all hover:bg-ledger-strong active:scale-95"
            >
              {concluindo ? 'Salvando…' : 'Concluir'} <Check size={18} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-xs text-[#f7f1e4]/50">Seus dados financeiros ficam salvos com segurança na sua conta.</p>
    </div>
  );
}
