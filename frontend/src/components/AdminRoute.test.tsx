// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminRoute from './AdminRoute';

const auth = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; role: 'client' | 'admin' },
  isInitializing: false,
}));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth }));

function renderRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/admin" element={<AdminRoute><p>Área administrativa</p></AdminRoute>} />
        <Route path="/dashboard" element={<p>Dashboard cliente</p>} />
        <Route path="/login" element={<p>Login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute', () => {
  beforeEach(() => { auth.user = null; auth.isInitializing = false; });

  it('redireciona uma conta client para o dashboard', () => {
    auth.user = { id: 'client-1', email: 'cliente@example.com', role: 'client' };
    renderRoute();
    expect(screen.getByText('Dashboard cliente')).toBeTruthy();
  });

  it('permite acesso para uma conta admin', () => {
    auth.user = { id: 'admin-1', email: 'admin@example.com', role: 'admin' };
    renderRoute();
    expect(screen.getByText('Área administrativa')).toBeTruthy();
  });
});
