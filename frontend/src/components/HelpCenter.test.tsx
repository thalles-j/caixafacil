// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import HelpCenter from './HelpCenter';

describe('HelpCenter', () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
  });

  it('abre com a busca em foco e fecha devolvendo o foco ao gatilho', async () => {
    render(<HelpCenter />);
    const trigger = screen.getByRole('button', { name: 'Ajuda' });

    fireEvent.click(trigger);

    const search = screen.getByRole('searchbox', { name: 'Buscar na ajuda' });
    await waitFor(() => expect(document.activeElement).toBe(search));
    expect(screen.getByRole('dialog', { name: 'Como podemos ajudar?' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('filtra tópicos pelo conteúdo e abre um tutorial', async () => {
    render(<HelpCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na ajuda' }), {
      target: { value: 'dinheiro contado' },
    });

    const topic = screen.getByRole('button', { name: /Como fechar o caixa e resolver pendências/ });
    expect(topic).toBeTruthy();
    fireEvent.click(topic);

    expect(screen.getByText('Passo 1 de 5')).toBeTruthy();
    expect(screen.getByText('Conferência com diferença de R$ 5,00')).toBeTruthy();
    expect(screen.getByText(/O esperado é R\$ 310,00/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('Passo 2 de 5')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('2');
  });

  it('abre uma explicação e retorna para a busca', () => {
    render(<HelpCenter />);
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
    fireEvent.click(screen.getByRole('button', { name: /Como funciona uma sessão de caixa/ }));

    expect(screen.getByText(/A sessão agrupa as vendas e movimentações/)).toBeTruthy();
    fireEvent.click(screen.getByText('Voltar à busca'));

    expect(screen.getByRole('searchbox', { name: 'Buscar na ajuda' })).toBeTruthy();
  });
});
