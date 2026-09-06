BEGIN;

-- A migration anterior criou uma lista fechada. As novas ações permanecem
-- explícitas para impedir valores arbitrários no histórico administrativo.
ALTER TABLE admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_action_check CHECK (action IN (
    'client_suspended', 'client_activated', 'client_deleted',
    'client_name_updated', 'client_password_reset',
    'admin_name_updated', 'admin_password_changed'
  ));

COMMIT;
