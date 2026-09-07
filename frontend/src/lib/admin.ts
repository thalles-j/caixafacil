import { ensureStoredAccessToken } from './auth';
import { observedFetch } from './observability';

const API_URL = import.meta.env.VITE_API_URL ?? '/api';

export type AccountStatus = 'active' | 'suspended';
export type AdminLevel = 'SUPPORT' | 'SUPERADMIN' | 'REVOKED';
export type AdminClientSummary = {
  id: string;
  email: string;
  name?: string;
  businessName: string;
  status: AccountStatus;
  createdAt: string;
  businessCount: number;
  activeBusinessCount: number;
  availableBusinessSlots: number;
  maxBusinesses: number;
};
export type AdminClientDetail = AdminClientSummary & {
  updatedAt: string;
  businesses: Array<{
    id: string; name: string; category: string; offering: 'produtos' | 'servicos' | 'ambos';
    status: 'active' | 'archived'; createdAt: string; operatorCount: number;
  }>;
};
export type AdminStats = {
  periodDays: 7 | 30 | 90; total: number; active: number; suspended: number; newInPeriod: number; businesses: number;
  distribution: { one: number; two: number; three: number };
  adoption: { multiBusinessPercent: number; whatsappConsentPercent: number; operatorsPercent: number; offlineQueuePercent: number };
  newAccountsSeries: Array<{ period: string; total: number }>;
};
export type AdminProfile = { id: string; email: string; name: string; adminLevel: AdminLevel; createdAt: string };
export type AdminAuditItem = {
  id: string; actorId?: string; actorName: string; actorRole?: string; targetUserId: string; targetName: string;
  businessId?: string; businessName?: string; action: string; details: Record<string, unknown>; createdAt: string;
};
export type PlatformAdmin = { id: string; name: string; email: string; status: string; adminLevel: AdminLevel; createdAt: string };
export type AdminOperations = {
  refreshedAt: string; refreshIntervalMinutes: number; health: { ok: boolean; database: string };
  sentry: { configured: boolean; recentErrors: number; recentSimulatedErrors: number; windowMinutes: number };
  uptime: null | { healthy: boolean; httpStatus: string; simulated: boolean; checkedAt: string; receivedAt: string };
  offlineQueues: { staleAfterHours: number; accountsWithStalePending: number };
};

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const execute = async (forceRefresh = false) => {
    const token = await ensureStoredAccessToken(forceRefresh);
    return observedFetch(`${API_URL}/admin${path}`, {
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

export function getAdminStats(days: 7 | 30 | 90 = 30) {
  return adminRequest<AdminStats>(`/stats?days=${days}`);
}

export function updateAdminBusinessStatus(clientId: string, businessId: string, status: 'active' | 'archived', confirmationName: string) {
  return adminRequest<{ id: string; status: 'active' | 'archived' }>(
    `/clients/${encodeURIComponent(clientId)}/businesses/${encodeURIComponent(businessId)}/status`,
    { method: 'PATCH', body: JSON.stringify({ status, confirmationName }) },
  );
}

export function listAdminAudit(params: { page: number; actor: string; action: string; target: string; from: string; to: string }) {
  const query = new URLSearchParams({ page: String(params.page), actor: params.actor, action: params.action,
    target: params.target, from: params.from, to: params.to });
  return adminRequest<{ items: AdminAuditItem[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(`/audit?${query}`);
}

export function listPlatformAdmins() { return adminRequest<{ items: PlatformAdmin[] }>('/admins'); }
export function updatePlatformAdminLevel(id: string, level: AdminLevel, confirmationName: string) {
  return adminRequest<{ id: string; adminLevel: AdminLevel; status: string }>(`/admins/${encodeURIComponent(id)}/level`, {
    method: 'PATCH', body: JSON.stringify({ level, confirmationName }),
  });
}
export function getAdminOperations(staleHours = 4) {
  return adminRequest<AdminOperations>(`/operations?staleHours=${staleHours}`);
}
export function simulateAdminErrorSpike(count = 5) {
  return adminRequest<AdminOperations['sentry']>('/operations/simulate-errors', {
    method: 'POST', body: JSON.stringify({ count }),
  });
}

export function downloadAdminAuditCsv(items: AdminAuditItem[]) {
  const columns = ['data', 'ator', 'papel', 'acao', 'conta_alvo', 'negocio_alvo', 'detalhes'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const lines = items.map((item) => [item.createdAt, item.actorName, item.actorRole, item.action,
    item.targetName, item.businessName, JSON.stringify(item.details)].map(escape).join(','));
  const blob = new Blob([`\uFEFF${columns.join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = 'auditoria-caixafacil.csv'; document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
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
