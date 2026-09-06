import { ensureStoredAccessToken } from './auth';
import { observedFetch } from './observability';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';
export type Operator = { id: string; name: string; email: string; active: boolean; createdAt?: string };
async function request<T>(path = '', init: RequestInit = {}): Promise<T> {
  const token = await ensureStoredAccessToken();
  const response = await observedFetch(`${API_URL}/operators${path}`, { ...init, credentials: 'include', headers: {
    Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers,
  }});
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? 'Não foi possível gerenciar operadores.');
  return body;
}
export const listOperators = () => request<{ operators: Operator[] }>();
export const createOperator = (input: { name: string; email: string; password: string }) => request<{ operator: Operator }>('', { method:'POST', body:JSON.stringify(input) });
export const setOperatorActive = (id: string, active: boolean) => request(`/`+encodeURIComponent(id)+'/status', { method:'PATCH', body:JSON.stringify({active}) });
