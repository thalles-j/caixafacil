// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Catalogo from './Catalogo';

afterEach(() => cleanup());

vi.mock('../context/AppDataContext', () => ({
  useAppData: () => ({
    data: {
      config: { oferta: 'ambos' },
      categorias: [],
      vendas: [],
      produtos: [
        {
          id: 'produto-1',
          nome: 'Produto de teste',
          precoVenda: 20,
          duracao: '30 min',
        },
      ],
    },
    addProduto: vi.fn(),
    atualizarProduto: vi.fn(),
    removerProduto: vi.fn(),
    addCategoria: vi.fn(() => true),
    editarCategoria: vi.fn(() => true),
    removerCategoria: vi.fn(),
  }),
}));
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { tenantRole: 'OWNER' } }),
}));

describe('modal de edição do Catálogo', () => {
  it('abre, troca o tipo e reabre repetidamente sem quebrar a tela', () => {
    render(<Catalogo />);

    for (let indice = 0; indice < 10; indice += 1) {
      fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
      const modal = screen.getByRole('dialog', { name: 'Editar item' });
      expect(modal).toBeTruthy();
      expect(within(modal).getByRole('button', { name: 'Serviço' }).getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByPlaceholderText('Ex: 30 min')).toBeTruthy();
      fireEvent.click(within(modal).getByRole('button', { name: 'Produto' }));
      expect(within(modal).getByRole('button', { name: 'Produto' }).getAttribute('aria-pressed')).toBe('true');
      fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    }

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Produto de teste')).toBeTruthy();
  });
});
