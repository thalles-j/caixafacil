BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_role') THEN
    ALTER TABLE users ADD CONSTRAINT ck_users_role CHECK (role IN ('client', 'admin'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_status') THEN
    ALTER TABLE users ADD CONSTRAINT ck_users_status CHECK (status IN ('active', 'suspended'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_users_role_status_created
  ON users (role, status, created_at DESC);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  target_user_id UUID NOT NULL,
  action         TEXT NOT NULL CHECK (action IN (
    'client_suspended', 'client_activated', 'client_deleted',
    'client_name_updated', 'client_password_reset',
    'admin_name_updated', 'admin_password_changed'
  )),
  details        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_admin_created
  ON admin_audit_logs (admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_created
  ON admin_audit_logs (target_user_id, created_at DESC);

COMMENT ON TABLE admin_audit_logs IS
  'Registro imutavel das acoes administrativas sensiveis; nao e exposto a role de tenant.';

COMMIT;
