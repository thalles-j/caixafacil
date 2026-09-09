// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ConfiguracoesColaborador from './ConfiguracoesColaborador';

const auth = vi.hoisted(() => ({
  changePassword: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'operator-1',
      name: 'Ana Operadora',
      email: 'ana@caixafacil.test',
      role: 'client',
      tenantRole: 'OPERATOR',
      businessName: 'Café Central',
    },
    changePassword: auth.changePassword,
    logout: auth.logout,
  }),
}));

vi.mock('../lib/theme', () => ({
  useDarkMode: () => [false, vi.fn()],
}));

describe('ConfiguracoesColaborador', () => {
  afterEach(cleanup);

  beforeEach(() => {
    auth.changePassword.mockReset();
    auth.logout.mockReset();
  });

  it('mostra o perfil do colaborador sem controles exclusivos do proprietário', () => {
    render(<MemoryRouter><ConfiguracoesColaborador /></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Minhas configurações' })).toBeTruthy();
    expect(screen.getByText('Ana Operadora')).toBeTruthy();
    expect(screen.getByText('ana@caixafacil.test')).toBeTruthy();
    expect(screen.getByText('Café Central')).toBeTruthy();
    expect(screen.queryByText('Gerenciar operadores')).toBeNull();
    expect(screen.queryByText('Zerar Dados do App')).toBeNull();
    expect(screen.queryByText('Importar Dados')).toBeNull();
  });

  it('permite alterar a senha do próprio colaborador', async () => {
    auth.changePassword.mockResolvedValue('Senha alterada com sucesso.');
    render(<MemoryRouter><ConfiguracoesColaborador /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'Atual123@' } });
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'NovaSenha123@' } });
    fireEvent.change(screen.getByLabelText('Confirmar nova senha'), { target: { value: 'NovaSenha123@' } });
    fireEvent.click(screen.getByRole('button', { name: 'Alterar senha' }));

    await waitFor(() => {
      expect(auth.changePassword).toHaveBeenCalledWith('Atual123@', 'NovaSenha123@', 'NovaSenha123@');
    });
    expect(await screen.findByText('Senha alterada com sucesso.')).toBeTruthy();
  });
});
