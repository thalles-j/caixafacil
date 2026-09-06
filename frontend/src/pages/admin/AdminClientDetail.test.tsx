// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getAdminClient: vi.fn(),
  updateAdminClientName: vi.fn(),
  updateAdminClientStatus: vi.fn(),
  resetAdminClientPassword: vi.fn(),
  deleteAdminClient: vi.fn(),
}));

vi.mock('../../lib/admin', () => ({
  ...mocks,
}));

import AdminClientDetail from './AdminClientDetail';

const client = {
  id: 'client-1',
  email: 'ana@example.com',
  name: 'Ana',
  businessName: 'Loja Ana',
  status: 'active',
  createdAt: '2026-01-01T12:00:00.000Z',
  updatedAt: '2026-01-01T12:00:00.000Z',
  onboardingCompleted: true,
  usage: { products: 1, sales: 2, cashClosings: 3, customers: 4, openCredits: 5 },
};

describe('poderes administrativos no detalhe do cliente', () => {
  beforeEach(() => {
    mocks.getAdminClient.mockReset().mockResolvedValue(client);
    mocks.updateAdminClientName.mockReset().mockResolvedValue({
      id: 'client-1', name: 'Mercado Ana', businessName: 'Mercado Ana',
    });
    mocks.updateAdminClientStatus.mockReset();
    mocks.resetAdminClientPassword.mockReset();
    mocks.deleteAdminClient.mockReset();
  });

  afterEach(cleanup);

  it('só libera a alteração depois que o nome exibido é digitado', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/clients/client-1']}>
        <Routes><Route path="/admin/clients/:id" element={<AdminClientDetail />} /></Routes>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Loja Ana' });
    fireEvent.click(screen.getByRole('button', { name: /Alterar nome/ }));

    const confirmButton = screen.getByRole('button', { name: 'Confirmar alteração' }) as HTMLButtonElement;
    expect(confirmButton.disabled).toBe(true);

    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    fireEvent.change(inputs[0], { target: { value: 'Mercado Ana' } });
    fireEvent.change(inputs[1], { target: { value: 'Loja Ana' } });
    expect(confirmButton.disabled).toBe(false);
    fireEvent.click(confirmButton);

    await waitFor(() => expect(mocks.updateAdminClientName).toHaveBeenCalledWith(
      'client-1', 'Mercado Ana', 'Loja Ana',
    ));
    expect(await screen.findByRole('heading', { name: 'Mercado Ana' })).toBeTruthy();
  });
});
