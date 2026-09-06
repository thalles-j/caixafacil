import type { TokenPayload } from './jwt.js';
import { pool } from '../db.js';

export type SessionUser = {
  id: string; email: string; name: string | null; role: 'client' | 'admin';
  token_version: number; status: string; password_hash: string;
  tenant_id: string | null; tenant_role: 'OWNER' | 'OPERATOR' | null;
  membership_active: boolean | null; owner_status: string | null; idle_timeout_minutes: number;
};

export async function sessionUser(id: string): Promise<SessionUser | undefined> {
  const result = await pool.query(
    `SELECT u.*, m.user_id AS tenant_id, m.role AS tenant_role, m.active AS membership_active,
       owner.status AS owner_status, COALESCE(bs.idle_timeout_minutes,15) AS idle_timeout_minutes
     FROM users u LEFT JOIN tenant_memberships m ON m.actor_id=u.id
     LEFT JOIN users owner ON owner.id=m.user_id
     LEFT JOIN business_settings bs ON bs.user_id=m.user_id WHERE u.id=$1`, [id]);
  return result.rows[0];
}

export function activeUser(user: SessionUser | undefined): user is SessionUser {
  return !!user && user.status === 'active' && (user.role === 'admin' ||
    (!!user.tenant_id && !!user.tenant_role && user.membership_active === true && user.owner_status === 'active'));
}

export function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role,
    tenantId: user.tenant_id, tenantRole: user.tenant_role, idleTimeoutMinutes: user.idle_timeout_minutes };
}

export function tokenPayload(user: SessionUser, sid: string): TokenPayload {
  return { sub: user.id, email: user.email, ver: Number(user.token_version), role: user.role,
    tenantId: user.tenant_id ?? undefined, tenantRole: user.tenant_role ?? undefined, sid };
}

export async function createSession(user: SessionUser): Promise<TokenPayload> {
  const result = await pool.query('INSERT INTO auth_sessions(user_id,actor_id) VALUES($1,$2) RETURNING id',
    [user.tenant_id ?? user.id, user.id]);
  return tokenPayload(user, result.rows[0].id);
}

export async function validateSession(payload: TokenPayload, touch = false, allowLocked = false) {
  const user = await sessionUser(payload.sub);
  if (!activeUser(user) || user.role !== payload.role || Number(user.token_version) !== payload.ver ||
    (user.role === 'client' && (user.tenant_id !== payload.tenantId || user.tenant_role !== payload.tenantRole)) || !payload.sid) {
    throw Object.assign(new Error('Sessão revogada. Entre novamente.'), { status: 401 });
  }
  const result = await pool.query(
    `UPDATE auth_sessions SET locked_at=CASE WHEN locked_at IS NOT NULL OR
       last_activity_at <= now()-($4::int * interval '1 minute') THEN COALESCE(locked_at,now()) ELSE NULL END
     WHERE id=$1 AND actor_id=$2 AND user_id=$3 AND expires_at>now() RETURNING locked_at`,
    [payload.sid, user.id, user.tenant_id ?? user.id, user.idle_timeout_minutes]);
  if (!result.rowCount) throw Object.assign(new Error('Sessão expirada.'), { status: 401 });
  if (result.rows[0].locked_at && !allowLocked) {
    throw Object.assign(new Error('Caixa bloqueado por inatividade. Confirme sua senha.'), { status: 423, code: 'SESSION_LOCKED' });
  }
  if (touch && !result.rows[0].locked_at) {
    await pool.query('UPDATE auth_sessions SET last_activity_at=now() WHERE id=$1 AND actor_id=$2', [payload.sid, user.id]);
  }
  return { user, locked: !!result.rows[0].locked_at };
}
