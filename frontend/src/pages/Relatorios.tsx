import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarBlank, CaretRight, ChartBar, FilePdf, Receipt, TrendDown, TrendUp } from '@phosphor-icons/react';
import { useAppData } from '../context/AppDataContext';
import { formatCurrency, formatDate } from '../lib/format';
import {
  agruparMovimentosPorDia,
  agruparProdutos,
  dataLocalISO,
  inicioDaSemanaISO,
  semanaISO,
  somarDias,
  type MovimentoDiario,
  type ProdutoAgrupado,
} from '../lib/reporting';
import { consolidatedReport, type ConsolidatedReport } from '../lib/businesses';

export default function Relatorios() {
  const { data } = useAppData();
  const ultimaData = useMemo(
    () =>
      data.fechamentosCaixa
        .map((sessao) => dataLocalISO(sessao.fechadoEm))
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a))[0] ?? dataLocalISO(new Date().toISOString()),
    [data.fechamentosCaixa],
  );
  const [diaSelecionado, setDiaSelecionado] = useState(ultimaData);
  const [semanaSelecionada, setSemanaSelecionada] = useState(semanaISO(ultimaData));
  const [mesSelecionado, setMesSelecionado] = useState(ultimaData.slice(0, 7));
  const [escopo, setEscopo] = useState<'individual'|'geral'>('individual');
  const [visaoGeral,setVisaoGeral]=useState<ConsolidatedReport|null>(null);
  const inicioSemana = inicioDaSemanaISO(semanaSelecionada);
  useEffect(()=>{
    if(escopo!=='geral'||!/^\d{4}-\d{2}$/.test(mesSelecionado)) return;
    const [year,month]=mesSelecionado.split('-').map(Number);
    const end=`${mesSelecionado}-${String(new Date(year,month,0).getDate()).padStart(2,'0')}`;
    void consolidatedReport(`${mesSelecionado}-01`,end).then(setVisaoGeral).catch(()=>setVisaoGeral(null));
  },[escopo,mesSelecionado]);

  const movimentosDoMes = useMemo(
    () =>
      agruparMovimentosPorDia(
        data.transacoes.filter((transacao) => dataLocalISO(transacao.ocorridoEm).startsWith(mesSelecionado)),
      ),
    [data.transacoes, mesSelecionado],
  );
  const produtosDoMes = useMemo(
    () =>
      agruparProdutos(data.vendas.filter((venda) => venda.data.startsWith(mesSelecionado)))
        .sort((a, b) => b.quantidade - a.quantidade || b.faturamento - a.faturamento)
        .slice(0, 6),
    [data.vendas, mesSelecionado],
  );
  const totalEntradas = movimentosDoMes.reduce((total, movimento) => total + movimento.entradas, 0);
  const totalSaidas = movimentosDoMes.reduce((total, movimento) => total + movimento.saidas, 0);
  const tituloMes = mesSelecionado
    ? new Date(`${mesSelecionado}-01T12:00:00`).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : 'mês não selecionado';

  return (
    <div className="fade-in">
      <header className="mb-5">
        <h2 className="font-display text-2xl font-bold text-ink">Relatórios</h2>
        <p className="mt-1 text-sm text-ink-soft">Escolha o período, abra o relatório completo e salve em PDF.</p>
      </header>

      <div className="mb-5 grid grid-cols-2 rounded-xl border border-line bg-line/30 p-1" aria-label="Escopo dos relatórios">
        <button onClick={()=>setEscopo('individual')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${escopo==='individual'?'bg-paper-raised text-ink shadow-sm':'text-ink-soft'}`}>Negócio atual</button>
        <button onClick={()=>setEscopo('geral')} className={`rounded-lg px-3 py-2 text-sm font-semibold ${escopo==='geral'?'bg-paper-raised text-ink shadow-sm':'text-ink-soft'}`}>Todos os negócios</button>
      </div>
      {escopo==='geral'&&<p className="mb-4 rounded-xl bg-ledger/10 p-3 text-xs text-ledger-strong dark:text-ledger">A visão geral soma os negócios vinculados ao seu login. Você poderá escolher quais entram no extrato.</p>}

      <section className="grid gap-4 lg:grid-cols-3">
        <GeradorRelatorio
          Icon={Receipt}
          titulo="Relatório diário"
          descricao="Produtos, pessoas que pagaram e conferência do fechamento."
          inputId="relatorio-dia"
          inputType="date"
          valor={diaSelecionado}
          aoAlterar={setDiaSelecionado}
          detalhe={diaSelecionado ? `Fechamento de ${formatDate(diaSelecionado)}` : ''}
          rota={diaSelecionado ? escopo==='geral'?`/relatorios/consolidado/diario/${diaSelecionado}`:`/relatorios/diario/${diaSelecionado}` : ''}
        />
        <GeradorRelatorio
          Icon={CalendarBlank}
          titulo="Relatório semanal"
          descricao="Resumo dos sete dias, principais produtos, entradas e despesas."
          inputId="relatorio-semana"
          inputType="week"
          valor={semanaSelecionada}
          aoAlterar={setSemanaSelecionada}
          detalhe={inicioSemana ? `${formatDate(inicioSemana)} a ${formatDate(somarDias(inicioSemana, 6))}` : ''}
          rota={inicioSemana ? escopo==='geral'?`/relatorios/consolidado/semanal/${inicioSemana}`:`/relatorios/semanal/${inicioSemana}` : ''}
        />
        <GeradorRelatorio
          Icon={ChartBar}
          titulo="Relatório mensal"
          descricao="Análise completa, ranking de produtos e dias de maior ou menor movimento."
          inputId="relatorio-mes"
          inputType="month"
          valor={mesSelecionado}
          aoAlterar={setMesSelecionado}
          detalhe={tituloMes}
          rota={mesSelecionado ? escopo==='geral'?`/relatorios/consolidado/mensal/${mesSelecionado}`:`/relatorios/mensal/${mesSelecionado}` : ''}
        />
      </section>

      {escopo==='geral'&&visaoGeral&&<section className="mt-7 border-t border-line pt-7"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="font-ledger text-[10px] font-bold uppercase tracking-[.18em] text-ink-soft">Visão rápida consolidada</p><h3 className="mt-1 font-display text-xl font-bold">{tituloMes}</h3></div><p className="text-xs text-ink-soft">{visaoGeral.businesses.map(b=>b.name).join(' + ')}</p></div><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{[['Vendas',visaoGeral.totals.sales],['Entradas',visaoGeral.totals.entries],['Saídas',visaoGeral.totals.outputs],['Saldo',visaoGeral.totals.entries-visaoGeral.totals.outputs]].map(([label,value])=><div key={String(label)} className="rounded-xl border border-line bg-paper-raised p-4"><p className="text-[10px] font-bold uppercase text-ink-soft">{label}</p><p className="mt-1 font-ledger text-lg font-bold">{formatCurrency(Number(value))}</p></div>)}</div></section>}

      <section className={`mt-7 border-t border-line pt-7 ${escopo==='geral'?'hidden':''}`}>
        <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="font-ledger text-[10px] font-bold uppercase tracking-[0.18em] text-ink-soft">Visão rápida</p>
            <h3 className="mt-1 font-display text-xl font-bold text-ink">Gráficos de {tituloMes}</h3>
          </div>
          <div className="flex gap-2 text-xs">
            <span className="rounded-full bg-ledger/10 px-2.5 py-1 font-semibold text-ledger-strong dark:text-ledger">
              Entradas {formatCurrency(totalEntradas)}
            </span>
            <span className="rounded-full bg-stamp/10 px-2.5 py-1 font-semibold text-stamp">
              Saídas {formatCurrency(totalSaidas)}
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <GraficoMovimento dados={movimentosDoMes} />
          <GraficoProdutos dados={produtosDoMes} />
        </div>
      </section>
    </div>
  );
}

function GeradorRelatorio({
  Icon,
  titulo,
  descricao,
  inputId,
  inputType,
  valor,
  aoAlterar,
  detalhe,
  rota,
}: {
  Icon: typeof Receipt;
  titulo: string;
  descricao: string;
  inputId: string;
  inputType: 'date' | 'week' | 'month';
  valor: string;
  aoAlterar: (valor: string) => void;
  detalhe: string;
  rota: string;
}) {
  return (
    <article className="flex flex-col rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
      <div className="flex items-start gap-3">
        <span className="rounded-xl bg-ledger/10 p-2.5 text-ledger-strong dark:text-ledger"><Icon size={21} weight="duotone" /></span>
        <div>
          <h3 className="font-display font-bold text-ink">{titulo}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">{descricao}</p>
        </div>
      </div>
      <label htmlFor={inputId} className="mt-5 text-[10px] font-bold uppercase tracking-wide text-ink-soft">Período do relatório</label>
      <input
        id={inputId}
        type={inputType}
        value={valor}
        onChange={(event) => aoAlterar(event.target.value)}
        className="mt-1.5 w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink outline-none focus:border-ledger"
      />
      <p className="mt-2 min-h-4 text-[10px] capitalize text-ink-soft">{detalhe}</p>
      <Link
        to={rota || '#'}
        aria-disabled={!rota}
        className={`mt-4 flex items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-bold transition ${rota ? 'bg-ledger text-paper hover:bg-ledger-strong' : 'pointer-events-none bg-line text-ink-soft opacity-60'}`}
      >
        <FilePdf size={16} /> Abrir relatório <CaretRight size={15} weight="bold" />
      </Link>
    </article>
  );
}

function GraficoMovimento({ dados }: { dados: MovimentoDiario[] }) {
  const maximo = Math.max(...dados.flatMap((item) => [item.entradas, item.saidas]), 1);
  return (
    <article className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-2 font-display font-bold text-ink"><ChartBar size={19} /> Movimento por dia</h4>
        <div className="flex gap-2 text-[9px] text-ink-soft">
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-ledger" /> Entradas</span>
          <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-stamp" /> Saídas</span>
        </div>
      </div>
      {dados.length === 0 ? (
        <EstadoVazio />
      ) : (
        <div className="mt-5 space-y-3" role="img" aria-label="Gráfico de entradas e saídas por dia">
          {dados.map((item) => (
            <div key={item.dia} className="grid grid-cols-[42px_minmax(0,1fr)_78px] items-center gap-2">
              <span className="font-ledger text-[10px] font-bold text-ink-soft">{item.dia.slice(8, 10)}/{item.dia.slice(5, 7)}</span>
              <div className="space-y-1">
                <Barra percentual={(item.entradas / maximo) * 100} classe="bg-ledger" />
                <Barra percentual={(item.saidas / maximo) * 100} classe="bg-stamp" />
              </div>
              <span className="text-right font-ledger text-[10px] font-bold text-ink">{formatCurrency(item.volume)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function GraficoProdutos({ dados }: { dados: ProdutoAgrupado[] }) {
  const maximo = Math.max(...dados.map((item) => item.quantidade), 1);
  return (
    <article className="rounded-2xl border border-line bg-paper-raised p-4 shadow-sm sm:p-5">
      <h4 className="flex items-center gap-2 font-display font-bold text-ink"><TrendUp size={19} /> Produtos mais vendidos</h4>
      {dados.length === 0 ? (
        <EstadoVazio />
      ) : (
        <div className="mt-5 space-y-3" role="img" aria-label="Gráfico dos produtos mais vendidos">
          {dados.map((produto, indice) => (
            <div key={produto.chave}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate font-medium text-ink">{indice + 1}. {produto.nome}</span>
                <span className="shrink-0 font-ledger font-bold text-ink">{produto.quantidade.toLocaleString('pt-BR')} un.</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line/50">
                <div className="h-full rounded-full bg-brass" style={{ width: `${Math.max((produto.quantidade / maximo) * 100, 2)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function Barra({ percentual, classe }: { percentual: number; classe: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-line/40">
      <div className={`h-full rounded-full ${classe}`} style={{ width: `${percentual > 0 ? Math.max(percentual, 2) : 0}%` }} />
    </div>
  );
}

function EstadoVazio() {
  return (
    <div className="flex flex-col items-center py-10 text-center text-ink-soft">
      <TrendDown size={24} />
      <p className="mt-2 text-xs">Nenhum movimento neste período.</p>
    </div>
  );
}
