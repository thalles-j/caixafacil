import type { TokenPayload } from './jwt.js';
import { pool } from '../db.js';

export type SessionUser = {
  id: string; email: string; name: string | null; role: 'client' | 'admin';
  token_version: number; status: string; password_hash: string;
  tenant_id: string | null; tenant_role: 'OWNER' | 'OPERATOR' | null;
  membership_active: boolean | null; owner_status: string | null; owner_user_id: string | null;
  business_name: string | null; business_category: string | null; business_offering: string | null;
  idle_timeout_minutes: number;
};

export async function sessionUser(id: string, businessId?: string): Promise<SessionUser | undefined> {
  const result = await pool.query(
    `SELECT u.*, m.business_id AS tenant_id, m.role AS tenant_role, m.active AS membership_active,
       m.owner_user_id,owner.status AS owner_status,m.business_name,m.category AS business_category,
       m.offering AS business_offering,COALESCE(bs.idle_timeout_minutes,15) AS idle_timeout_minutes
     FROM users u
     LEFT JOIN LATERAL (
       SELECT bm.business_id,bm.role,bm.active,b.owner_user_id,b.name AS business_name,b.category,b.offering,b.created_at
       FROM business_memberships bm JOIN businesses b ON b.id=bm.business_id
       WHERE bm.user_id=u.id AND bm.active AND b.archived_at IS NULL
         AND ($2::uuid IS NULL OR bm.business_id=$2)
       ORDER BY (bm.role='OWNER') DESC,b.created_at,b.id LIMIT 1
     ) m ON true
     LEFT JOIN users owner ON owner.id=m.owner_user_id
     LEFT JOIN business_settings bs ON bs.business_id=m.business_id WHERE u.id=$1`, [id,businessId ?? null]);
  return result.rows[0];
}

export function activeUser(user: SessionUser | undefined): user is SessionUser {
  return !!user && user.status === 'active' && (user.role === 'admin' ||
    (!!user.tenant_id && !!user.tenant_role && user.membership_active === true && user.owner_status === 'active'));
}

export function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role,
    tenantId: user.tenant_id, tenantRole: user.tenant_role, businessName:user.business_name,
    idleTimeoutMinutes: user.idle_timeout_minutes };
}

export function tokenPayload(user: SessionUser, sid: string): TokenPayload {
  return { sub: user.id, email: user.email, ver: Number(user.token_version), role: user.role,
    tenantId: user.tenant_id ?? undefined, tenantRole: user.tenant_role ?? undefined, sid };
}

export async function createSession(user: SessionUser): Promise<TokenPayload> {
  const result = await pool.query('INSERT INTO auth_sessions(user_id,actor_id,business_id) VALUES($1,$2,$3) RETURNING id',
    [user.owner_user_id ?? user.id, user.id,user.tenant_id]);
  return tokenPayload(user, result.rows[0].id);
}

export async function validateSession(payload: TokenPayload, touch = false, allowLocked = false) {
  const user = await sessionUser(payload.sub,payload.tenantId);
  if (!activeUser(user) || user.role !== payload.role || Number(user.token_version) !== payload.ver ||
    (user.role === 'client' && (user.tenant_id !== payload.tenantId || user.tenant_role !== payload.tenantRole)) || !payload.sid) {
    throw Object.assign(new Error('Sessão revogada. Entre novamente.'), { status: 401 });
  }
  const result = await pool.query(
    `UPDATE auth_sessions SET locked_at=CASE WHEN locked_at IS NOT NULL OR
       last_activity_at <= now()-($4::int * interval '1 minute') THEN COALESCE(locked_at,now()) ELSE NULL END
     WHERE id=$1 AND actor_id=$2 AND business_id IS NOT DISTINCT FROM $3::uuid AND expires_at>now() RETURNING locked_at`,
    [payload.sid, user.id, user.tenant_id, user.idle_timeout_minutes]);
  if (!result.rowCount) throw Object.assign(new Error('Sessão expirada.'), { status: 401 });
  if (result.rows[0].locked_at && !allowLocked) {
    throw Object.assign(new Error('Caixa bloqueado por inatividade. Confirme sua senha.'), { status: 423, code: 'SESSION_LOCKED' });
  }
  if (touch && !result.rows[0].locked_at) {
    await pool.query('UPDATE auth_sessions SET last_activity_at=now() WHERE id=$1 AND actor_id=$2', [payload.sid, user.id]);
  }
  return { user, locked: !!result.rows[0].locked_at };
}
