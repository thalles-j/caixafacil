// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Configuracoes from './Configuracoes';

vi.mock('../context/AppDataContext', () => ({
  useAppData: () => ({
    data: {
      config: {
        nome: 'Café Central',
        categoria: 'Alimentação',
        oferta: 'ambos',
        controlaEstoque: true,
        metaDiariaVendas: 600,
        viewPeriod: 'day',
        idleTimeoutMinutes: 15,
        despesasFixas: [],
        relatorio: { frequencia: 'nenhum', porEmail: false, email: '' },
        onboardingConcluido: true,
      },
    },
    setConfig: vi.fn(),
    resetData: vi.fn(),
    cadastrarDespesaFixaNoBanco: vi.fn(),
    removerDespesaFixaNoBanco: vi.fn(),
  }),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { email: 'dono@caixafacil.test', tenantRole: 'OWNER' },
    logout: vi.fn(),
    resetAccountData: vi.fn(),
    changePassword: vi.fn(),
  }),
}));

vi.mock('../lib/theme', () => ({ useDarkMode: () => [false, vi.fn()] }));
vi.mock('../lib/business', () => ({ sendReportEmailRequest: vi.fn() }));

afterEach(cleanup);

describe('áreas das configurações', () => {
  it('exibe uma categoria por vez e permite navegar entre elas', () => {
    render(<MemoryRouter><Configuracoes /></MemoryRouter>);

    const conta = screen.getByRole('heading', { name: 'Conta e segurança' }).closest('section');
    const negocio = screen.getByText('Nome do Negócio').closest('section');
    expect(conta?.classList.contains('hidden')).toBe(false);
    expect(negocio?.classList.contains('hidden')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /Negócio e PDV/ }));

    expect(conta?.classList.contains('hidden')).toBe(true);
    expect(negocio?.classList.contains('hidden')).toBe(false);
    expect(screen.getByRole('button', { name: /Negócio e PDV/ }).getAttribute('aria-current')).toBe('page');
  });
});
