import { describe, expect, it } from 'vitest';
import { filterHelpTopics, helpTopics } from './helpContent';

describe('conteúdo da ajuda', () => {
  it('mantém explicações e tutoriais disponíveis', () => {
    expect(helpTopics.filter((topic) => topic.kind === 'explanation')).toHaveLength(9);
    expect(helpTopics.filter((topic) => topic.kind === 'tutorial')).toHaveLength(13);
    expect(
      helpTopics
        .filter((topic) => topic.kind === 'tutorial')
        .every((topic) => topic.example.title && topic.example.situation && topic.example.expectedResult),
    ).toBe(true);
  });

  it('pesquisa sem diferenciar acentos ou maiúsculas', () => {
    const results = filterHelpTopics('RELATORIO DIARIO');

    expect(results.map((topic) => topic.id)).toContain('gerar-relatorio');
  });

  it('encontra palavras presentes no conteúdo dos passos', () => {
    const results = filterHelpTopics('dinheiro contado');

    expect(results.map((topic) => topic.id)).toContain('fechar-caixa');
  });

  it('encontra palavras presentes nos exemplos práticos', () => {
    const results = filterHelpTopics('cesta personalizada');

    expect(results.map((topic) => topic.id)).toContain('venda-avulsa');
  });

  it('exige que todos os termos pesquisados estejam no tópico', () => {
    const results = filterHelpTopics('cliente baixa');

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((topic) => filterHelpTopics('cliente', [topic]).length === 1)).toBe(true);
    expect(results.every((topic) => filterHelpTopics('baixa', [topic]).length === 1)).toBe(true);
  });
});
