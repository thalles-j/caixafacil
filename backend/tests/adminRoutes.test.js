import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../src/db.ts', () => ({ pool: { query: mocks.query, connect: mocks.connect } }));
vi.mock('../src/auth/jwt.ts', () => ({ verifyToken: vi.fn() }));
const passwordMocks = vi.hoisted(() => ({
  comparePassword: vi.fn(),
  hashPassword: vi.fn(),
  passwordValidationError: vi.fn(),
}));
vi.mock('../src/auth/password.ts', () => passwordMocks);

import {
  changeAdminPasswordHandler,
  clientDetailHandler,
  deleteClientHandler,
  listClientsHandler,
  resetClientPasswordHandler,
  updateAdminNameHandler,
  updateClientNameHandler,
  updateClientStatusHandler,
} from '../src/admin/routes.ts';

function response() {
  return {
    locals: { auth: { sub: 'admin-1', role: 'admin' } },
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

beforeEach(() => {
  mocks.query.mockReset();
  mocks.connect.mockReset();
  passwordMocks.comparePassword.mockReset();
  passwordMocks.hashPassword.mockReset().mockResolvedValue('hash-seguro');
  passwordMocks.passwordValidationError.mockReset().mockReturnValue(null);
});

describe('handlers dos endpoints administrativos', () => {
  it('lista clientes com paginação fixa de 15', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{ id: 'client-1', email: 'cliente@example.com', name: 'Ana', status: 'active', created_at: new Date('2026-01-01'), business_name: 'Loja Ana' }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const res = response();
    await listClientsHandler({ query: { page: '1', status: 'active', search: 'ana' } }, res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body.items[0]).toMatchObject({ id: 'client-1', businessName: 'Loja Ana', status: 'active' });
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 15, total: 1 });
  });

  it('retorna detalhes apenas com metadados agregados', async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{
      id: 'client-1', email: 'cliente@example.com', name: 'Ana', status: 'active',
      created_at: new Date('2026-01-01'), updated_at: new Date('2026-02-01'), business_name: 'Loja Ana',
      business_category: 'Varejo', offering: 'produtos', onboarding_completed: true,
      products: 12, sales: 35, cash_closings: 8, customers: 5, open_credits: 2,
    }] });
    const res = response();
    await clientDetailHandler({ params: { id: 'client-1' } }, res, vi.fn());
    expect(res.body.usage).toEqual({ products: 12, sales: 35, cashClosings: 8, customers: 5, openCredits: 2 });
    expect(res.body).not.toHaveProperty('transactions');
  });

  it('suspende a conta, revoga sessões e grava auditoria', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'client-1', email: 'cliente@example.com', name: 'Ana', business_name: 'Loja Ana', status: 'active' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await updateClientStatusHandler({ params: { id: 'client-1' }, body: { status: 'suspended', confirmationName: 'Loja Ana' } }, res, vi.fn());
    expect(res.body).toEqual({ id: 'client-1', status: 'suspended' });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('token_version = token_version + 1'))).toBe(true);
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO admin_audit_logs'))).toBe(true);
  });

  it('exige confirmação para excluir e grava auditoria antes da remoção', async () => {
    const unconfirmed = response();
    await deleteClientHandler({ params: { id: 'client-1' }, body: { confirm: false } }, unconfirmed, vi.fn());
    expect(unconfirmed.statusCode).toBe(400);

    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'client-1', email: 'cliente@example.com', name: 'Ana', status: 'active', business_name: 'Loja Ana' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await deleteClientHandler({ params: { id: 'client-1' }, body: { confirm: true, confirmationName: 'Loja Ana' } }, res, vi.fn());
    expect(res.statusCode).toBe(204);
    const auditIndex = client.query.mock.calls.findIndex(([sql]) => String(sql).includes('INSERT INTO admin_audit_logs'));
    const deleteIndex = client.query.mock.calls.findIndex(([sql]) => String(sql).includes('DELETE FROM users'));
    expect(auditIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(auditIndex);
  });

  it('exige o nome exibido e registra a alteração de nome do cliente', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'client-1', email: 'cliente@example.com', name: 'Ana', business_name: 'Loja Ana' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await updateClientNameHandler({
      params: { id: 'client-1' },
      body: { name: 'Mercado da Ana', confirmationName: 'Loja Ana' },
    }, res, vi.fn());
    expect(res.body).toEqual({ id: 'client-1', name: 'Mercado da Ana', businessName: 'Mercado da Ana' });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes("'client_name_updated'"))).toBe(true);
  });

  it('redefine a senha do cliente, revoga sessões e não registra a senha na auditoria', async () => {
    const client = { query: vi.fn(), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'client-1', email: 'cliente@example.com', name: 'Ana', business_name: 'Loja Ana' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await resetClientPasswordHandler({
      params: { id: 'client-1' },
      body: { newPassword: 'Nova123@', confirmPassword: 'Nova123@', confirmationName: 'Loja Ana' },
    }, res, vi.fn());
    expect(res.body.message).toMatch(/sessões.*revogadas/i);
    expect(passwordMocks.hashPassword).toHaveBeenCalledWith('Nova123@');
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('token_version = token_version + 1'))).toBe(true);
    expect(JSON.stringify(client.query.mock.calls)).not.toContain('Nova123@');
  });

  it('protege as alterações do próprio admin com nome e senha atual', async () => {
    const nameClient = { query: vi.fn(), release: vi.fn() };
    nameClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'admin-1', email: 'admin@example.com', name: 'Thalles' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValueOnce(nameClient);
    const nameResponse = response();
    await updateAdminNameHandler({ body: { name: 'Thalles Admin', confirmationName: 'Thalles' } }, nameResponse, vi.fn());
    expect(nameResponse.body.name).toBe('Thalles Admin');

    const passwordClient = { query: vi.fn(), release: vi.fn() };
    passwordClient.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'admin-1', email: 'admin@example.com', name: 'Thalles Admin', password_hash: 'hash-atual' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValueOnce(passwordClient);
    passwordMocks.comparePassword.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const passwordResponse = response();
    await changeAdminPasswordHandler({ body: {
      currentPassword: 'Atual123@', newPassword: 'Nova123@', confirmPassword: 'Nova123@', confirmationName: 'Thalles Admin',
    } }, passwordResponse, vi.fn());
    expect(passwordResponse.body.message).toMatch(/alterada com sucesso/i);
  });
});
