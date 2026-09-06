// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Financas from './Financas';

vi.mock('../context/AppDataContext', () => ({
  useAppData: () => ({
    data: {
      config: { nome: 'Negócio de Teste', despesasFixas: [] },
      contas: [],
      clientes: [],
      lancamentosManuais: [],
    },
    addConta: vi.fn(),
    editarConta: vi.fn(),
    removerConta: vi.fn(),
    marcarContaQuitada: vi.fn(),
    editarLancamentoManual: vi.fn(),
    removerLancamentoManual: vi.fn(),
    editarCliente: vi.fn(),
    baixarFiado: vi.fn(),
    baixarDespesaFixa: vi.fn(),
  }),
}));

afterEach(() => cleanup());

describe('abas do Financeiro', () => {
  it('alterna repetidamente mantendo a página e o indicador estáveis', () => {
    render(
      <MemoryRouter initialEntries={['/financas?tab=pagar']}>
        <Routes>
          <Route path="/financas" element={<Financas />} />
        </Routes>
      </MemoryRouter>,
    );

    const pagar = screen.getByRole('button', { name: 'A Pagar' });
    const receber = screen.getByRole('button', { name: 'A Receber (Fiado)' });

    for (let indice = 0; indice < 12; indice += 1) {
      fireEvent.click(receber);
      fireEvent.click(pagar);
    }
    fireEvent.click(receber);

    expect(receber.getAttribute('aria-pressed')).toBe('true');
    expect(pagar.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(/Nenhuma entrada registrada/)).toBeTruthy();
  });
});
