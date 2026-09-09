// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  changePasswordRequest,
  clearStoredToken,
  decodeToken,
  ensureStoredAccessToken,
  getStoredToken,
  isTokenValid,
  setStoredToken,
  TOKEN_KEY,
} from './auth';

function fakeToken(payload: Record<string, unknown>): string {
  const base64url = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.assinatura-fake`;
}

describe('decodeToken', () => {
  it('decodifica o payload de um token válido', () => {
    const token = fakeToken({ sub: 'user-1', email: 'a@b.com', iat: 1000, exp: 2000 });
    expect(decodeToken(token)).toEqual({ sub: 'user-1', email: 'a@b.com', iat: 1000, exp: 2000 });
  });

  it('retorna null para um token malformado', () => {
    expect(decodeToken('nao-e-um-jwt')).toBeNull();
  });
});

describe('isTokenValid', () => {
  beforeEach(() => {
    localStorage.clear();
    clearStoredToken();
    vi.restoreAllMocks();
  });
  it('retorna false para token nulo', () => {
    expect(isTokenValid(null)).toBe(false);
  });

  it('retorna false para token malformado', () => {
    expect(isTokenValid('lixo')).toBe(false);
  });

  it('retorna true para um token cujo exp ainda não passou', () => {
    const futuro = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeToken({ sub: 'user-1', email: 'a@b.com', iat: 0, exp: futuro });
    expect(isTokenValid(token)).toBe(true);
  });

  it('retorna false para um token expirado', () => {
    const passado = Math.floor(Date.now() / 1000) - 3600;
    const token = fakeToken({ sub: 'user-1', email: 'a@b.com', iat: 0, exp: passado });
    expect(isTokenValid(token)).toBe(false);
  });

  it('renova automaticamente um token expirado usando a sessão persistente', async () => {
    const expirado = fakeToken({ sub: 'user-1', email: 'a@b.com', iat: 0, exp: 1 });
    const renovado = fakeToken({
      sub: 'user-1',
      email: 'a@b.com',
      iat: 0,
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    setStoredToken(expirado);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({
        token: renovado,
        user: { id: 'user-1', email: 'a@b.com' },
        data: null,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    await expect(ensureStoredAccessToken()).resolves.toBe(renovado);
    expect(getStoredToken()).toBe(renovado);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/refresh', expect.objectContaining({
      method: 'POST',
      credentials: 'include',
      headers: expect.any(Headers),
    }));
  });

  it('mantém o token no sessionStorage por no máximo quinze minutos', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const token = fakeToken({ sub: 'user-1', email: 'a@b.com', iat: 0, exp });

    setStoredToken(token);

    expect(getStoredToken()).toBe(token);
    expect(JSON.parse(sessionStorage.getItem('caixafacil-auth-token')!).expiresAt).toBeLessThanOrEqual(
      Date.now() + 15 * 60_000,
    );
  });
});

describe('changePasswordRequest', () => {
  it('envia as senhas ao endpoint autenticado da conta', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ message: 'Senha alterada com sucesso.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(changePasswordRequest('token-seguro', 'atual123', 'nova123', 'nova123')).resolves.toEqual({
      message: 'Senha alterada com sucesso.',
    });
    const [, options] = fetchMock.mock.calls.find(([url]) => url === '/api/account/password')!;
    expect(options).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ currentPassword: 'atual123', newPassword: 'nova123', confirmPassword: 'nova123' }),
    });
    const headers = options?.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token-seguro');
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('X-Request-ID')).toMatch(/^[0-9a-f-]{36}$/);
  });
});
