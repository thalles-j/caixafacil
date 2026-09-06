import type { AppData } from '../types';

/** Chave legada, mantida apenas para remover tokens gravados por versões antigas. */
export const TOKEN_KEY = 'mnb-auth-token';
let accessTokenInMemory: string | null = null;

function removeLegacyStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // A sessão HTTP-only continua funcionando quando o armazenamento é bloqueado.
  }
}

export type TokenPayload = {
  sub: string;
  email: string;
  iat: number;
  exp: number;
  role: 'client' | 'admin';
};

export function decodeToken(token: string): TokenPayload | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function isTokenValid(token: string | null): token is string {
  if (!token) return false;
  const payload = decodeToken(token);
  if (!payload) return false;
  return payload.exp * 1000 > Date.now();
}

export function getStoredToken(): string | null {
  // O refresh token HTTP-only restaura a sessão após recarregar a página.
  // O access token não precisa ficar acessível em armazenamento persistente.
  removeLegacyStoredToken();
  return accessTokenInMemory;
}

export function setStoredToken(token: string) {
  accessTokenInMemory = token;
  removeLegacyStoredToken();
}

export function clearStoredToken() {
  accessTokenInMemory = null;
  removeLegacyStoredToken();
}

let refreshInFlight: Promise<AuthResponse> | null = null;

export async function ensureStoredAccessToken(forceRefresh = false): Promise<string> {
  const currentToken = getStoredToken();
  if (!forceRefresh && isTokenValid(currentToken)) return currentToken;

  if (!refreshInFlight) {
    refreshInFlight = refreshSessionRequest().finally(() => {
      refreshInFlight = null;
    });
  }
  try {
    const session = await refreshInFlight;
    setStoredToken(session.token);
    return session.token;
  } catch (error) {
    clearStoredToken();
    throw error;
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type AuthResponse = {
  token: string;
  user: { id: string; email: string; role: 'client' | 'admin' };
  data?: AppData | null;
};
export type SessionResponse = Omit<AuthResponse, 'token'>;
export type AccountBackup = {
  format: 'caixafacil-postgres-backup';
  version: 2;
  exportedAt: string;
  tables: Record<string, unknown[]>;
};

async function parseJsonOrThrow(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(body?.error ?? 'Não foi possível completar a solicitação.');
  }
  return body;
}

export async function registerRequest(
  email: string,
  password: string,
  confirmPassword: string,
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/register`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, confirmPassword }),
  });
  return parseJsonOrThrow(res);
}

export async function loginRequest(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return parseJsonOrThrow(res);
}

export async function forgotPasswordRequest(email: string): Promise<{ message: string; resetToken?: string }> {
  const res = await fetch(`${API_URL}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return parseJsonOrThrow(res);
}

export async function resetPasswordRequest(
  token: string,
  password: string,
  confirmPassword: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password, confirmPassword }),
  });
  return parseJsonOrThrow(res);
}

export async function sessionRequest(token: string): Promise<SessionResponse> {
  const res = await fetch(`${API_URL}/auth/me`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJsonOrThrow(res);
}

export async function refreshSessionRequest(): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  return parseJsonOrThrow(res);
}

export async function logoutRequest(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok && res.status !== 401) {
    throw new Error('Não foi possível encerrar a sessão no servidor.');
  }
}

export async function resetAccountDataRequest(token: string): Promise<void> {
  const res = await fetch(`${API_URL}/account/data`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Não foi possível zerar os dados da conta.');
  }
}

export async function exportAccountBackupRequest(token: string): Promise<AccountBackup> {
  const res = await fetch(`${API_URL}/account/backup`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}` },
  });
  return parseJsonOrThrow(res);
}

export async function restoreAccountBackupRequest(token: string, backup: AccountBackup): Promise<void> {
  const res = await fetch(`${API_URL}/account/backup`, {
    method: 'PUT',
    credentials: 'include',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(backup),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? 'Não foi possível restaurar o backup.');
  }
}

export async function changePasswordRequest(
  token: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string,
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/account/password`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
  return parseJsonOrThrow(res);
}
