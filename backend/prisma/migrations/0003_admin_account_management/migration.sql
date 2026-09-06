BEGIN;

-- A migration anterior criou uma lista fechada. O formato abaixo continua
-- restritivo, mas permite que migrations posteriores adicionem ações com
-- namespace sem tornar a reaplicação do schema incompatível com dados atuais.
ALTER TABLE admin_audit_logs
  DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;

ALTER TABLE admin_audit_logs
  ADD CONSTRAINT admin_audit_logs_action_check
  CHECK (action ~ '^[a-z][a-z0-9_.-]{1,99}$');

COMMIT;
