import { describe, expect, it, vi } from 'vitest';
import { requireAdmin } from '../src/admin/requireAdmin.ts';

function responseFor(role) {
  const response = {
    locals: { auth: role ? { role } : undefined },
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  return response;
}

describe('requireAdmin', () => {
  it('bloqueia uma conta client com 403', () => {
    const response = responseFor('client');
    const next = vi.fn();
    requireAdmin({}, response, next);
    expect(response.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('permite uma conta admin', () => {
    const response = responseFor('admin');
    const next = vi.fn();
    requireAdmin({}, response, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
