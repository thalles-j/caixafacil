import { AsyncLocalStorage } from 'node:async_hooks';
import type { PoolClient } from 'pg';

export type AuditActor = { tenantId: string; actorId: string; actorRole: 'OWNER' | 'OPERATOR' };
export const requestActor = new AsyncLocalStorage<AuditActor & { method: string; path: string }>();

export async function auditTenant(client: PoolClient, actor: AuditActor, action: string, targetId: string, details: Record<string, unknown> = {}) {
  await client.query(
    `INSERT INTO admin_audit_logs (business_id, actor_id, actor_role, target_user_id, action, details)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [actor.tenantId, actor.actorId, actor.actorRole, targetId, action, JSON.stringify(details)],
  );
}
