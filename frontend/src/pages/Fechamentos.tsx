import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowCounterClockwise,
  CalendarBlank,
  CaretRight,
  CheckCircle,
  Receipt,
  WarningCircle,
} from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import Pagination from '../components/Pagination';
import { formatCurrency, formatDate } from '../lib/format';
import { dataLocalISO } from '../lib/reporting';
import { paginateItems } from '../lib/pagination';
import type { SessaoCaixa } from '../types';

function somar(sessoes: SessaoCaixa[], campo: keyof SessaoCaixa): number {
  return sessoes.reduce((total, sessao) => total + Number(sessao[campo] ?? 0), 0);
}

export default function Fechamentos() {
  const navigate = useNavigate();
  const { data, reabrirCaixa } = useAppData();
  const [confirmandoCorrecao, setConfirmandoCorrecao] = useState(false);
  const [reabrindo, setReabrindo] = useState(false);
  const [erroCorrecao, setErroCorrecao] = useState<string | null>(null);
  const [pagina, setPagina] = useState(1);

  const ultimoFechamento = useMemo(
    () =>
      [...data.fechamentosCaixa].sort(
        (a, b) =>
          (b.abertoEm ?? '').localeCompare(a.abertoEm ?? '') ||
          (b.fechadoEm ?? '').localeCompare(a.fechadoEm ?? ''),
      )[0],
    [data.fechamentosCaixa],
  );

  const dias = useMemo(() => {
    const grupos = new Map<string, SessaoCaixa[]>();
    data.fechamentosCaixa.forEach((sessao) => {
      const dia = dataLocalISO(sessao.fechadoEm);
      if (!dia) return;
      grupos.set(dia, [...(grupos.get(dia) ?? []), sessao]);
    });
    return Array.from(grupos.entries())
      .map(([dia, sessoes]) => ({ dia, sessoes }))
      .sort((a, b) => b.dia.localeCompare(a.dia));
  }, [data.fechamentosCaixa]);
  const diasPaginados = paginateItems(dias, pagina);

  const confirmarReabertura = async () => {
    if (!ultimoFechamento || data.caixaAtual) return;
    setReabrindo(true);
    setErroCorrecao(null);
    try {
      await reabrirCaixa(ultimoFechamento.id);
      navigate('/fechar-caixa');
    } catch (error) {
      setErroCorrecao(error instanceof Error ? error.message : 'Não foi possível reabrir o fechamento.');
    } finally {
      setReabrindo(false);
    }
  };

  return (
    <div className="fade-in">
      <header className="mb-5">
        <h2 className="font-display text-2xl font-bold text-ink">Fechamentos de Caixa</h2>
        <p className="mt-1 text-sm text-ink-soft">Escolha um dia para abrir os detalhes do fechamento.</p>
      </header>

      {ultimoFechamento && !data.caixaAtual && (
        <section className="mb-5 rounded-2xl border border-brass/30 bg-brass/10 p-4 sm:p-5">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-start gap-3">
              <span className="shrink-0 rounded-xl bg-brass/15 p-2.5 text-brass">
                <ArrowCounterClockwise size={21} weight="bold" />
              </span>
              <div>
                <h3 className="font-display font-bold text-ink">Errou no último fechamento?</h3>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  Reabra o caixa para corrigir o dinheiro contado, pendências ou um lançamento esquecido.
                  Vendas e movimentações já registradas não serão apagadas.
                </p>
              </div>
            </div>
            {!confirmandoCorrecao && (
              <button
                type="button"
                onClick={() => {
                  setConfirmandoCorrecao(true);
                  setErroCorrecao(null);
                }}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-brass/40 bg-paper px-4 py-2.5 text-sm font-bold text-brass transition hover:bg-brass/10"
              >
                <ArrowCounterClockwise size={17} /> Corrigir fechamento
              </button>
            )}
          </div>

          {confirmandoCorrecao && (
            <div className="mt-4 rounded-xl border border-brass/30 bg-paper p-4">
              <div className="flex items-start gap-2">
                <WarningCircle size={19} weight="fill" className="shrink-0 text-brass" />
                <div>
                  <p className="text-sm font-semibold text-ink">Reabrir o último caixa?</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                    O fechamento voltará ao estado aberto. Faça a correção e feche novamente para atualizar o histórico.
                    Somente o fechamento mais recente pode passar por esse processo.
                  </p>
                </div>
              </div>
              {erroCorrecao && <p className="mt-3 text-xs font-semibold text-stamp">{erroCorrecao}</p>}
              <div className="mt-3 flex flex-col gap-2 min-[400px]:flex-row">
                <button
                  type="button"
                  disabled={reabrindo}
                  onClick={() => {
                    setConfirmandoCorrecao(false);
                    setErroCorrecao(null);
                  }}
                  className="flex-1 rounded-lg border border-line px-3 py-2 text-xs font-semibold text-ink disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={reabrindo}
                  onClick={() => void confirmarReabertura()}
                  className="flex-1 rounded-lg bg-brass px-3 py-2 text-xs font-bold text-paper disabled:opacity-50"
                >
                  {reabrindo ? 'Reabrindo…' : 'Reabrir para corrigir'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {dias.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-line bg-paper-raised px-5 py-14 text-center shadow-sm">
          <span className="mb-3 rounded-full bg-line/40 p-3 text-ink-soft"><Receipt size={25} /></span>
          <p className="font-semibold text-ink">Nenhum fechamento registrado.</p>
          <p className="mt-1 text-sm text-ink-soft">Os caixas fechados aparecerão aqui agrupados por dia.</p>
        </section>
      ) : (
        <div className="space-y-4">
          {diasPaginados.items.map(({ dia, sessoes }) => {
            const entradas =
              somar(sessoes, 'vendasDinheiro') +
              somar(sessoes, 'vendasPix') +
              somar(sessoes, 'vendasCartao') +
              somar(sessoes, 'vendasFiado');
            const contado = somar(sessoes, 'dinheiroContado');
            const diferenca = somar(sessoes, 'diferenca');
            const pendencias = somar(sessoes, 'pendenciasIdentificacao');

            return (
              <article key={dia} className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-ink-soft">
                      <CalendarBlank size={17} />
                      <span className="font-ledger text-[10px] font-bold uppercase tracking-wide">Fechamento diário</span>
                    </div>
                    <h3 className="mt-1 font-display text-xl font-bold text-ink">Fechamento do dia {formatDate(dia)}</h3>
                    <p className="mt-1 text-xs text-ink-soft">
                      {sessoes.length} caixa{sessoes.length === 1 ? '' : 's'} fechado{sessoes.length === 1 ? '' : 's'} neste dia
                    </p>
                  </div>

                  <Link
                    to={`/relatorios/diario/${dia}`}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ledger px-4 py-2.5 text-sm font-bold text-paper transition hover:bg-ledger-strong"
                  >
                    Abrir relatório <CaretRight size={16} weight="bold" />
                  </Link>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
                  <Resumo label="Entradas e fiado" valor={entradas} />
                  <Resumo label="Dinheiro contado" valor={contado} />
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">Resultado</p>
                    <p className={`mt-0.5 font-ledger text-sm font-bold ${diferenca < 0 ? 'text-stamp' : diferenca > 0 ? 'text-brass' : 'text-ledger-strong dark:text-ledger'}`}>
                      {diferenca < 0
                        ? `Quebra de ${formatCurrency(Math.abs(diferenca))}`
                        : diferenca > 0
                          ? `Sobra de ${formatCurrency(diferenca)}`
                          : 'Conferido'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">Pendências</p>
                    <p className={`mt-0.5 inline-flex items-center gap-1 font-ledger text-sm font-bold ${pendencias > 0 ? 'text-brass' : 'text-ledger-strong dark:text-ledger'}`}>
                      {pendencias > 0 ? <WarningCircle size={14} weight="fill" /> : <CheckCircle size={14} weight="fill" />}
                      {pendencias}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
      <Pagination
        currentPage={diasPaginados.currentPage}
        totalItems={dias.length}
        onPageChange={setPagina}
        itemLabel="dias de fechamento"
      />
    </div>
  );
}

function Resumo({ label, valor }: { label: string; valor: number }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-wide text-ink-soft">{label}</p>
      <p className="mt-0.5 font-ledger text-sm font-bold text-ink">{formatCurrency(valor)}</p>
    </div>
  );
}
