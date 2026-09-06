import { ensureStoredAccessToken } from './auth';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type AccountStatus = 'active' | 'suspended';
export type AdminClientSummary = {
  id: string;
  email: string;
  name?: string;
  businessName: string;
  status: AccountStatus;
  createdAt: string;
};
export type AdminClientDetail = AdminClientSummary & {
  businessCategory?: string;
  offering?: 'produtos' | 'servicos' | 'ambos';
  onboardingCompleted: boolean;
  updatedAt: string;
  usage: { products: number; sales: number; cashClosings: number; customers: number; openCredits: number };
};
export type AdminStats = { total: number; active: number; suspended: number; newLast30Days: number };
export type AdminProfile = { id: string; email: string; name: string; createdAt: string };

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const execute = async (forceRefresh = false) => {
    const token = await ensureStoredAccessToken(forceRefresh);
    return fetch(`${API_URL}/admin${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  };
  let response = await execute();
  if (response.status === 401) response = await execute(true);
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? 'Não foi possível completar a operação administrativa.');
  return body as T;
}

export function listAdminClients(params: { page: number; search: string; status: 'all' | AccountStatus }) {
  const query = new URLSearchParams({ page: String(params.page), search: params.search, status: params.status });
  return adminRequest<{
    items: AdminClientSummary[];
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }>(`/clients?${query}`);
}

export function getAdminStats() {
  return adminRequest<AdminStats>('/stats');
}

export function getAdminClient(id: string) {
  return adminRequest<AdminClientDetail>(`/clients/${encodeURIComponent(id)}`);
}

export function updateAdminClientStatus(id: string, status: AccountStatus, confirmationName: string) {
  return adminRequest<{ id: string; status: AccountStatus }>(`/clients/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, confirmationName }),
  });
}

export function updateAdminClientName(id: string, name: string, confirmationName: string) {
  return adminRequest<{ id: string; name: string; businessName: string }>(`/clients/${encodeURIComponent(id)}/name`, {
    method: 'PATCH',
    body: JSON.stringify({ name, confirmationName }),
  });
}

export function resetAdminClientPassword(
  id: string,
  newPassword: string,
  confirmPassword: string,
  confirmationName: string,
) {
  return adminRequest<{ message: string }>(`/clients/${encodeURIComponent(id)}/password`, {
    method: 'PATCH',
    body: JSON.stringify({ newPassword, confirmPassword, confirmationName }),
  });
}

export function deleteAdminClient(id: string, confirmationName: string) {
  return adminRequest<void>(`/clients/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ confirm: true, confirmationName }),
  });
}

export function getAdminProfile() {
  return adminRequest<AdminProfile>('/profile');
}

export function updateAdminProfileName(name: string, confirmationName: string) {
  return adminRequest<{ id: string; name: string }>('/profile/name', {
    method: 'PATCH',
    body: JSON.stringify({ name, confirmationName }),
  });
}

export function changeAdminProfilePassword(data: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  confirmationName: string;
}) {
  return adminRequest<{ message: string }>('/profile/password', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}
