BEGIN;

-- Papéis internos da equipe da plataforma. O papel principal `admin` continua
-- separado dos papéis de tenant e nunca recebe contexto de negócio/RLS.
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_level TEXT;
UPDATE users SET admin_level = 'SUPERADMIN' WHERE role = 'admin' AND admin_level IS NULL;
UPDATE users SET admin_level = NULL WHERE role <> 'admin';
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_admin_level;
ALTER TABLE users ADD CONSTRAINT ck_users_admin_level CHECK (
  (role = 'admin' AND admin_level IN ('SUPPORT', 'SUPERADMIN', 'REVOKED')) OR
  (role <> 'admin' AND admin_level IS NULL)
);
CREATE INDEX IF NOT EXISTS idx_users_admin_level ON users(admin_level) WHERE role = 'admin';

-- Somente telemetria agregada da fila local. Nenhum item, valor, cliente ou
-- conteúdo de venda é enviado ao servidor por este mecanismo.
CREATE TABLE IF NOT EXISTS offline_queue_status (
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pending_count INTEGER NOT NULL DEFAULT 0 CHECK (pending_count >= 0),
  oldest_pending_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, actor_id)
);
ALTER TABLE offline_queue_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE offline_queue_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS offline_queue_business_isolation ON offline_queue_status;
CREATE POLICY offline_queue_business_isolation ON offline_queue_status FOR ALL
  USING (business_id = app_current_business_id())
  WITH CHECK (business_id = app_current_business_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON offline_queue_status TO mnb_app_runtime;

-- Último resultado recebido do monitor externo. A tabela não contém URL,
-- credencial, corpo de resposta ou qualquer dado de tenant.
CREATE TABLE IF NOT EXISTS platform_monitor_status (
  monitor_name TEXT PRIMARY KEY,
  healthy BOOLEAN NOT NULL,
  http_status TEXT NOT NULL,
  simulated BOOLEAN NOT NULL DEFAULT false,
  checked_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_action_created
  ON admin_audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_business_created
  ON admin_audit_logs(business_id, created_at DESC);

COMMIT;
