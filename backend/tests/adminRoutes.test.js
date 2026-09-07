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
  listAuditHandler,
  listClientsHandler,
  resetClientPasswordHandler,
  simulateErrorSpikeHandler,
  updateAdminNameHandler,
  updateAdminLevelHandler,
  updateBusinessStatusHandler,
  updateClientNameHandler,
  updateClientStatusHandler,
} from '../src/admin/routes.ts';

function response() {
  return {
    locals: { auth: { sub: 'admin-1', role: 'admin' }, adminLevel: 'SUPERADMIN' },
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
      .mockResolvedValueOnce({ rows: [{ id: 'client-1', email: 'cliente@example.com', name: 'Ana', status: 'active', created_at: new Date('2026-01-01'), business_count: 2, active_business_count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const res = response();
    await listClientsHandler({ query: { page: '1', status: 'active', search: 'ana' } }, res, vi.fn());
    expect(res.statusCode).toBe(200);
    expect(res.body.items[0]).toMatchObject({ id: 'client-1', businessName: 'Ana', status: 'active', businessCount: 2, availableBusinessSlots: 1 });
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 15, total: 1 });
  });

  it('retorna detalhes apenas com metadados agregados', async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1, rows: [{
      id: 'client-1', email: 'cliente@example.com', name: 'Ana', status: 'active',
      created_at: new Date('2026-01-01'), updated_at: new Date('2026-02-01'),
    }] }).mockResolvedValueOnce({ rows: [{ id: 'business-1', name: 'Loja Ana', category: 'Varejo', offering: 'produtos', created_at: new Date('2026-01-02'), archived_at: null, operator_count: 2 }] });
    const res = response();
    await clientDetailHandler({ params: { id: '11111111-1111-4111-8111-111111111111' } }, res, vi.fn());
    expect(res.body.businesses[0]).toMatchObject({ name: 'Loja Ana', operatorCount: 2, status: 'active' });
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
    await updateClientStatusHandler({ params: { id: 'client-1' }, body: { status: 'suspended', confirmationName: 'Ana' } }, res, vi.fn());
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
    await deleteClientHandler({ params: { id: 'client-1' }, body: { confirm: true, confirmationName: 'Ana' } }, res, vi.fn());
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
      body: { name: 'Mercado da Ana', confirmationName: 'Ana' },
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
      body: { newPassword: 'Nova123@', confirmPassword: 'Nova123@', confirmationName: 'Ana' },
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

  it('filtra detalhes sensíveis ao listar a auditoria', async () => {
    mocks.query
      .mockResolvedValueOnce({ rows: [{
        id: 10, actor_id: 'admin-1', actor_name: 'Equipe', actor_role: 'SUPPORT',
        target_user_id: 'client-1', target_name: 'Conta', business_id: null, business_name: null,
        action: 'client_password_reset',
        details: { sessionsRevoked: true, email: 'privado@example.com', password: 'segredo' },
        created_at: new Date('2026-09-01T12:00:00Z'),
      }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });
    const res = response();
    await listAuditHandler({ query: { actor: 'Equipe', action: 'client_password_reset', from: '2026-09-01', to: '2026-09-02' } }, res, vi.fn());
    expect(res.body.items[0].details).toEqual({ sessionsRevoked: true });
    expect(JSON.stringify(res.body)).not.toContain('privado@example.com');
    expect(res.body.pagination).toMatchObject({ page: 1, pageSize: 25, total: 1 });
  });

  it('arquiva somente o negócio escolhido e registra o escopo da ação', async () => {
    const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: '22222222-2222-4222-8222-222222222222', name: 'Filial Centro', archived_at: null }] })
      .mockResolvedValueOnce({ rows: [{ total: 2 }] });
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await updateBusinessStatusHandler({ params: {
      id: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
    }, body: { status: 'archived', confirmationName: 'Filial Centro' } }, res, vi.fn());
    expect(res.body).toEqual({ id: '22222222-2222-4222-8222-222222222222', status: 'archived' });
    const audit = client.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO admin_audit_logs'));
    expect(audit).toBeTruthy();
    expect(audit[1].join(' ')).toContain('single_business');
    expect(audit[1].join(' ')).not.toContain('Filial Centro');
  });

  it('altera o nível administrativo, revoga sessões e audita sem dados pessoais', async () => {
    const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: '33333333-3333-4333-8333-333333333333', name: 'Suporte Um', email: 'suporte@example.com', admin_level: 'SUPPORT',
      }] });
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await updateAdminLevelHandler({ params: { id: '33333333-3333-4333-8333-333333333333' }, body: {
      level: 'REVOKED', confirmationName: 'Suporte Um',
    } }, res, vi.fn());
    expect(res.body).toEqual({ id: '33333333-3333-4333-8333-333333333333', adminLevel: 'REVOKED', status: 'suspended' });
    expect(client.query.mock.calls.some(([sql]) => String(sql).includes('DELETE FROM auth_sessions'))).toBe(true);
    const audit = client.query.mock.calls.find(([sql]) => String(sql).includes("'admin_level_changed'"));
    expect(audit[1].join(' ')).toContain('REVOKED');
    expect(audit[1].join(' ')).not.toContain('suporte@example.com');
  });

  it('impede remover o último superadministrador ativo', async () => {
    const client = { query: vi.fn().mockResolvedValue({}), release: vi.fn() };
    client.query
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rowCount: 1, rows: [{
        id: '44444444-4444-4444-8444-444444444444', name: 'Admin Principal', email: 'admin@example.com', admin_level: 'SUPERADMIN',
      }] })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({});
    mocks.connect.mockResolvedValue(client);
    const res = response();
    await updateAdminLevelHandler({ params: { id: '44444444-4444-4444-8444-444444444444' }, body: {
      level: 'SUPPORT', confirmationName: 'Admin Principal',
    } }, res, vi.fn());
    expect(res.statusCode).toBe(409);
    expect(client.query.mock.calls.some(([sql]) => String(sql).startsWith('UPDATE users SET admin_level'))).toBe(false);
  });

  it('simula um pico operacional limitado e registra somente o indicador seguro', async () => {
    mocks.query.mockResolvedValueOnce({ rowCount: 1 });
    const res = response();
    await simulateErrorSpikeHandler({ body: { count: 5 } }, res, vi.fn());
    expect(res.body.recentErrors).toBeGreaterThanOrEqual(5);
    expect(res.body.recentSimulatedErrors).toBeGreaterThanOrEqual(5);
    expect(mocks.query.mock.calls[0][1][1]).toBe('{"simulated":true}');

    const invalid = response();
    await simulateErrorSpikeHandler({ body: { count: 51 } }, invalid, vi.fn());
    expect(invalid.statusCode).toBe(400);
  });
});
