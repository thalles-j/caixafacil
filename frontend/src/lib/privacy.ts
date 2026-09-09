import { ensureStoredAccessToken } from './auth';
import { observedFetch } from './observability';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';
export type ConsentText = { version: string; text: string };

async function privacyRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await ensureStoredAccessToken();
  const response = await observedFetch(`${API_URL}/privacy${path}`, {
    method,
    credentials: 'include',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error ?? 'Não foi possível concluir a solicitação de privacidade.');
  return result as T;
}

export const getConsentText = () => privacyRequest<ConsentText>('/consent-text');
export const recordWhatsAppConsent = (customerId: string, granted: boolean, version: string) =>
  privacyRequest(`/customers/${encodeURIComponent(customerId)}/whatsapp-consent`, 'POST', { granted, version });
export const getWhatsAppCharge = (customerId: string) =>
  privacyRequest<{ url: string }>(`/customers/${encodeURIComponent(customerId)}/whatsapp-charge`, 'POST');
export const anonymizeCustomer = (customerId: string, confirmationId: string) =>
  privacyRequest(`/customers/${encodeURIComponent(customerId)}/personal-data`, 'DELETE', { confirmationId });
