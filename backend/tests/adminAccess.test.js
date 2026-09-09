import { beforeEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('../src/db.ts', () => ({ pool: { query } }));
import { loadAdminLevel, requireSuperadmin } from '../src/admin/access.ts';

function response(level) {
  return { locals: { auth: { sub: 'admin-1', role: 'admin' }, adminLevel: level }, statusCode: 200,
    status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

describe('níveis administrativos', () => {
  beforeEach(() => query.mockReset());

  it('revalida o nível no banco em cada chamada', async () => {
    query.mockResolvedValue({ rowCount: 1, rows: [{ admin_level: 'SUPPORT' }] });
    const res = response(); const next = vi.fn();
    loadAdminLevel({}, res, next);
    await vi.waitFor(() => expect(next).toHaveBeenCalled());
    expect(res.locals.adminLevel).toBe('SUPPORT');
  });

  it('retorna 403 para SUPPORT em ações de SUPERADMIN', () => {
    const res = response('SUPPORT'); const next = vi.fn();
    requireSuperadmin({}, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });
});
