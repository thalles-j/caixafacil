// @vitest-environment jsdom

/**
 * Abordagem escolhida: renderizar o AppDataProvider de verdade (via
 * @testing-library/react + renderHook) e exercitar useAppData(), em vez de
 * extrair a lógica de cálculo para funções puras fora do contexto.
 *
 * Motivo: extrair os useMemo para funções puras exigiria reorganizar
 * AppDataContext.tsx — este arquivo é só para adicionar testes cobrindo o
 * comportamento já existente, sem alterar a lógica ou a estrutura do
 * contexto. Testar através do provider real também garante que o teste
 * valida exatamente o que o resto do app consome via useAppData(), e não uma
 * reimplementação paralela da lógica que poderia divergir do código real com
 * o tempo.
 */

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDataProvider, useAppData } from './AppDataContext';
import { APP_DATA_CHANGED_EVENT, STORAGE_KEY } from '../lib/storage';
import type { CompanyConfig } from '../types';

/**
 * Sobre os testes de sincronização entre abas (evento "storage"): num
 * navegador de verdade, o próprio navegador dispara o evento "storage"
 * automaticamente em toda OUTRA aba/janela quando uma delas grava no
 * localStorage — mas nunca na aba que fez a gravação. O jsdom modela uma
 * única janela por ambiente de teste, então não existe uma "outra aba" real
 * aqui: chamar localStorage.setItem() neste mesmo ambiente não dispara o
 * evento sozinho (mesmo comportamento de um navegador real para a aba que
 * escreveu). Por isso os testes abaixo disparam um StorageEvent sintético via
 * window.dispatchEvent(...) para simular o que a aba ATUAL receberia se OUTRA
 * aba tivesse feito essa gravação — isso testa exatamente o que é
 * responsabilidade do app (reagir corretamente a esse evento), sem depender
 * de reproduzir a mecânica multi-aba nativa do navegador, que é
 * responsabilidade da própria spec/implementação do navegador, não do app.
 * A verificação de que o navegador de fato não reenvia o evento para a aba
 * de origem (e portanto não há risco de loop) foi confirmada manualmente
 * abrindo duas abas reais.
 */

function configPadrao(overrides: Partial<CompanyConfig> = {}): CompanyConfig {
  return {
    nome: 'Negócio de Teste',
    categoria: 'Outros',
    oferta: 'ambos',
    controlaEstoque: true,
    despesasFixas: [],
    relatorio: { frequencia: 'nenhum', porEmail: false },
    viewPeriod: 'day',
    onboardingConcluido: true,
    ...overrides,
  };
}

function renderAppData() {
  return renderHook(() => useAppData(), { wrapper: AppDataProvider });
}

/** Mocka o instante atual — passe um horário com offset explícito (ex: -03:00) para o teste ser determinístico independente do fuso da máquina que roda. */
function mockarAgora(isoComOffset: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(isoComOffset));
}

describe('AppDataContext', () => {
  const originalTZ = process.env.TZ;

  beforeEach(() => {
    // força o horário de Brasília, igual ao já usado nos testes de todayISO
    process.env.TZ = 'America/Sao_Paulo';
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = originalTZ;
  });

  describe('vendasHoje / despesasHoje', () => {
    it('soma apenas as vendas de hoje, ignorando vendas de outros dias', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'Venda hoje',
          quantidade: 2,
          valorUnitario: 10,
          formaPagamento: 'dinheiro',
        });
        result.current.addVenda({
          data: '2026-08-02',
          descricao: 'Venda ontem',
          quantidade: 1,
          valorUnitario: 999,
          formaPagamento: 'dinheiro',
        });
      });

      expect(result.current.vendasHoje).toBe(20);
    });

    it('vendasHoje só inclui uma venda fiado depois do recebimento', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'Fiado hoje',
          quantidade: 1,
          valorUnitario: 50,
          formaPagamento: 'fiado',
        });
      });

      expect(result.current.vendasHoje).toBe(0);

      const contaFiado = result.current.data.contas.find((conta) => conta.origemVendaId)!;
      act(() => {
        result.current.marcarContaQuitada(contaFiado.id, '2026-08-03');
      });

      expect(result.current.vendasHoje).toBe(50);
    });

    it('soma contas pagas hoje e lançamentos de saída de hoje, ignorando outros dias', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'pagar', descricao: 'Aluguel', valor: 30, vencimento: '2026-08-01' });
        result.current.addLancamentoManual({ tipo: 'saida', descricao: 'Compra avulsa', valor: 15, data: '2026-08-03' });
        result.current.addLancamentoManual({ tipo: 'saida', descricao: 'Saída de ontem', valor: 999, data: '2026-08-02' });
      });

      const conta = result.current.data.contas.find((c) => c.descricao === 'Aluguel')!;
      act(() => {
        result.current.marcarContaQuitada(conta.id, '2026-08-03');
      });

      expect(result.current.despesasHoje).toBe(45);
    });
  });

  describe('resumoPeriodo', () => {
    it('soma vendas e despesas apenas do dia quando viewPeriod é "day"', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.setConfig(configPadrao({ viewPeriod: 'day' }));
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'V1',
          quantidade: 1,
          valorUnitario: 100,
          formaPagamento: 'dinheiro',
        });
        result.current.addVenda({
          data: '2026-08-02',
          descricao: 'Fora do dia',
          quantidade: 1,
          valorUnitario: 500,
          formaPagamento: 'dinheiro',
        });
        result.current.addLancamentoManual({ tipo: 'saida', descricao: 'D1', valor: 40, data: '2026-08-03' });
      });

      expect(result.current.resumoPeriodo).toEqual({ vendas: 100, despesas: 40 });
    });

    it('soma vendas e despesas dos últimos 7 dias quando viewPeriod é "week"', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.setConfig(configPadrao({ viewPeriod: 'week' }));
        result.current.addVenda({
          data: '2026-07-29',
          descricao: 'Dentro da janela de 7 dias',
          quantidade: 1,
          valorUnitario: 100,
          formaPagamento: 'dinheiro',
        });
        result.current.addVenda({
          data: '2026-07-20',
          descricao: 'Fora da janela de 7 dias',
          quantidade: 1,
          valorUnitario: 500,
          formaPagamento: 'dinheiro',
        });
        result.current.addLancamentoManual({ tipo: 'saida', descricao: 'D1', valor: 40, data: '2026-08-01' });
      });

      expect(result.current.resumoPeriodo).toEqual({ vendas: 100, despesas: 40 });
    });

    it('retorna zero para vendas e despesas quando não há nenhum lançamento no período', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.setConfig(configPadrao({ viewPeriod: 'day' }));
      });

      expect(result.current.resumoPeriodo).toEqual({ vendas: 0, despesas: 0 });
    });
  });

  describe('contasVencendoEmBreve / contasVencidas', () => {
    it('classifica corretamente vencida, vencendo em breve e fora da janela, e exclui contas já quitadas', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'pagar', descricao: 'Vencida', valor: 10, vencimento: '2026-08-01' });
        result.current.addConta({ tipo: 'pagar', descricao: 'Vencendo em breve', valor: 20, vencimento: '2026-08-05' });
        result.current.addConta({ tipo: 'pagar', descricao: 'Fora da janela', valor: 30, vencimento: '2026-08-10' });
        result.current.addConta({ tipo: 'pagar', descricao: 'Vencida mas já quitada', valor: 40, vencimento: '2026-08-01' });
      });

      const paraQuitar = result.current.data.contas.find((c) => c.descricao === 'Vencida mas já quitada')!;
      act(() => {
        result.current.marcarContaQuitada(paraQuitar.id);
      });

      const descricoesVencidas = result.current.contasVencidas.map((c) => c.descricao);
      const descricoesVencendo = result.current.contasVencendoEmBreve.map((c) => c.descricao);

      expect(descricoesVencidas).toEqual(['Vencida']);
      expect(descricoesVencendo).toEqual(['Vencendo em breve']);
    });

    it('considera também contas a receber (fiado) — uma conta "receber" vencida aparece em contasVencidas', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'receber', descricao: 'Fiado vencido', valor: 10, vencimento: '2026-08-01' });
      });

      expect(result.current.contasVencidas.map((c) => c.descricao)).toEqual(['Fiado vencido']);
    });

    it('uma conta "receber" vencendo dentro da janela de 3 dias aparece em contasVencendoEmBreve', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'receber', descricao: 'Fiado vencendo em breve', valor: 10, vencimento: '2026-08-05' });
      });

      expect(result.current.contasVencendoEmBreve.map((c) => c.descricao)).toEqual(['Fiado vencendo em breve']);
    });

    it('uma conta "receber" já quitada não aparece em nenhuma das duas listas', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'receber', descricao: 'Fiado vencido mas pago', valor: 10, vencimento: '2026-08-01' });
        result.current.addConta({ tipo: 'receber', descricao: 'Fiado vencendo mas pago', valor: 10, vencimento: '2026-08-05' });
      });

      const [vencidoPago, vencendoPago] = result.current.data.contas;
      act(() => {
        result.current.marcarContaQuitada(vencidoPago.id);
        result.current.marcarContaQuitada(vencendoPago.id);
      });

      expect(result.current.contasVencidas).toHaveLength(0);
      expect(result.current.contasVencendoEmBreve).toHaveLength(0);
    });
  });

  describe('vendasUltimos7Dias', () => {
    it('retorna exatamente 7 dias (hoje + 6 anteriores), com zero nos dias sem venda', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'Venda de hoje',
          quantidade: 2,
          valorUnitario: 10,
          formaPagamento: 'dinheiro',
        });
      });

      const dias = result.current.vendasUltimos7Dias;

      expect(dias.map((d) => d.data)).toEqual([
        '2026-07-28',
        '2026-07-29',
        '2026-07-30',
        '2026-07-31',
        '2026-08-01',
        '2026-08-02',
        '2026-08-03',
      ]);
      expect(dias.find((d) => d.data === '2026-08-03')?.total).toBe(20);
      expect(dias.filter((d) => d.data !== '2026-08-03').every((d) => d.total === 0)).toBe(true);
    });
  });

  describe('editarVenda / removerVenda — bloqueio de venda fiado já quitada', () => {
    it('removerVenda retorna false e não altera nada quando a conta fiado vinculada já foi paga', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'Fiado',
          quantidade: 1,
          valorUnitario: 50,
          formaPagamento: 'fiado',
        });
      });
      const venda = result.current.data.vendas[0];
      const conta = result.current.data.contas.find((c) => c.origemVendaId === venda.id)!;

      act(() => {
        result.current.marcarContaQuitada(conta.id);
      });

      let retorno: boolean | undefined;
      act(() => {
        retorno = result.current.removerVenda(venda.id);
      });

      expect(retorno).toBe(false);
      expect(result.current.data.vendas).toHaveLength(1);
      expect(result.current.data.contas.find((c) => c.id === conta.id)).toBeDefined();
    });

    it('editarVenda retorna false e não muda a forma de pagamento quando a conta fiado vinculada já foi paga', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'Fiado',
          quantidade: 1,
          valorUnitario: 50,
          formaPagamento: 'fiado',
        });
      });
      const venda = result.current.data.vendas[0];
      const conta = result.current.data.contas.find((c) => c.origemVendaId === venda.id)!;

      act(() => {
        result.current.marcarContaQuitada(conta.id);
      });

      let retorno: boolean | undefined;
      act(() => {
        retorno = result.current.editarVenda(venda.id, { formaPagamento: 'dinheiro' });
      });

      expect(retorno).toBe(false);
      expect(result.current.data.vendas[0].formaPagamento).toBe('fiado');
      expect(result.current.data.contas.find((c) => c.id === conta.id)?.quitado).toBe(true);
    });
  });

  describe('removerVenda em cascata', () => {
    it('remove a conta fiado vinculada ainda em aberto junto com a venda, sem deixar dado órfão', () => {
      mockarAgora('2026-08-03T10:00:00-03:00');
      const { result } = renderAppData();

      act(() => {
        result.current.addVenda({
          data: '2026-08-03',
          descricao: 'Fiado',
          quantidade: 1,
          valorUnitario: 50,
          formaPagamento: 'fiado',
        });
      });
      const venda = result.current.data.vendas[0];
      const conta = result.current.data.contas.find((c) => c.origemVendaId === venda.id)!;
      expect(conta.quitado).toBe(false);

      let retorno: boolean | undefined;
      act(() => {
        retorno = result.current.removerVenda(venda.id);
      });

      expect(retorno).toBe(true);
      expect(result.current.data.vendas.find((v) => v.id === venda.id)).toBeUndefined();
      expect(result.current.data.contas.find((c) => c.id === conta.id)).toBeUndefined();
    });
  });

  describe('categorias personalizadas', () => {
    it('renomeia a categoria nos produtos e preserva os produtos ao excluir', async () => {
      const { result } = renderAppData();

      let criada = false;
      await act(async () => {
        criada = await result.current.addCategoria('Bebidas');
      });
      expect(criada).toBe(true);

      const categoria = result.current.data.categorias[0];
      await act(async () => {
        await result.current.addProduto({
          type: 'product',
          nome: 'Refrigerante',
          categoria: 'Bebidas',
          precoVenda: 8,
          quantidade: 10,
          quantidadeMinima: 2,
        });
      });

      let editada = false;
      await act(async () => {
        editada = await result.current.editarCategoria(categoria.id, 'Bebidas geladas');
      });
      expect(editada).toBe(true);
      expect(result.current.data.produtos[0].categoria).toBe('Bebidas geladas');

      await act(async () => {
        await result.current.removerCategoria(categoria.id);
      });
      expect(result.current.data.categorias).toHaveLength(0);
      expect(result.current.data.produtos).toHaveLength(1);
      expect(result.current.data.produtos[0].categoria).toBeUndefined();
    });
  });

  describe('hidratação autenticada', () => {
    it('prioriza o onboarding concluído vindo do banco sobre um cache local antigo', () => {
      const { result } = renderAppData();

      act(() => {
        result.current.setConfig(configPadrao({ onboardingConcluido: false }));
      });

      act(() => {
        window.dispatchEvent(
          new CustomEvent(APP_DATA_CHANGED_EVENT, {
            detail: {
              ...result.current.data,
              config: configPadrao({ onboardingConcluido: true }),
            },
          }),
        );
      });

      expect(result.current.data.config?.onboardingConcluido).toBe(true);
    });
  });

  describe('sincronização entre abas (evento storage)', () => {
    it('recarrega os dados quando o evento storage dispara para a chave do app', () => {
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'pagar', descricao: 'Original desta aba', valor: 10, vencimento: '2026-08-01' });
      });
      expect(result.current.data.contas).toHaveLength(1);

      // simula outra aba gravando um estado totalmente diferente
      const dadosDeOutraAba = {
        config: null,
        vendas: [],
        produtos: [],
        contas: [
          { id: 'conta-outra-aba', tipo: 'pagar', descricao: 'Gravado por outra aba', valor: 99, vencimento: '2026-08-01', quitado: false },
        ],
        lancamentosManuais: [],
        clientes: [],
      };

      act(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(dadosDeOutraAba));
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: STORAGE_KEY,
            newValue: JSON.stringify(dadosDeOutraAba),
            storageArea: localStorage,
          }),
        );
      });

      expect(result.current.data.contas).toHaveLength(1);
      expect(result.current.data.contas[0].descricao).toBe('Gravado por outra aba');
    });

    it('trata newValue null (chave removida/zerada em outra aba) voltando a um estado vazio, sem quebrar', () => {
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'pagar', descricao: 'Original', valor: 10, vencimento: '2026-08-01' });
      });
      expect(result.current.data.contas).toHaveLength(1);

      act(() => {
        localStorage.removeItem(STORAGE_KEY);
        window.dispatchEvent(
          new StorageEvent('storage', { key: STORAGE_KEY, newValue: null, storageArea: localStorage }),
        );
      });

      expect(result.current.data.contas).toHaveLength(0);
      expect(result.current.data.config).toBeNull();
    });

    it('ignora eventos storage de outras chaves do localStorage', () => {
      const { result } = renderAppData();

      act(() => {
        result.current.addConta({ tipo: 'pagar', descricao: 'Original', valor: 10, vencimento: '2026-08-01' });
      });

      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'alguma-outra-chave', newValue: '{}', storageArea: localStorage }),
        );
      });

      expect(result.current.data.contas).toHaveLength(1);
      expect(result.current.data.contas[0].descricao).toBe('Original');
    });
  });
});
