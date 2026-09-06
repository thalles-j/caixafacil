BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_kind TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_account_kind;
ALTER TABLE users ADD CONSTRAINT ck_users_account_kind CHECK (account_kind IN ('owner', 'operator'));
DO $$ BEGIN
  CREATE TYPE tenant_role AS ENUM ('OWNER', 'OPERATOR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tenant_memberships (
  actor_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((role = 'OWNER' AND actor_id = user_id) OR (role = 'OPERATOR' AND actor_id <> user_id))
);
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='tenant_memberships' AND policyname='tenant_memberships_isolation') THEN
    CREATE POLICY tenant_memberships_isolation ON tenant_memberships
      USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
  END IF;
END $$;
-- Aplicado uma vez: operadores futuros sempre são criados junto com seu vínculo.
INSERT INTO tenant_memberships(actor_id,user_id,role)
SELECT id,id,'OWNER' FROM users WHERE role='client' AND account_kind='owner'
ON CONFLICT (actor_id) DO NOTHING;
GRANT SELECT, INSERT, UPDATE ON tenant_memberships TO mnb_app_runtime;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days'
);
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='auth_sessions' AND policyname='auth_sessions_isolation') THEN
    CREATE POLICY auth_sessions_isolation ON auth_sessions
      USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id());
  END IF;
END $$;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions TO mnb_app_runtime;

ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS idle_timeout_minutes INTEGER NOT NULL DEFAULT 15 CHECK (idle_timeout_minutes BETWEEN 1 AND 120);
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS receipt_settings JSONB NOT NULL DEFAULT '{"paperWidth":80,"showOperator":true,"showPaymentMethod":true}'::jsonb;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS actor_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_sale_id UUID;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS request_hash TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returned_amount >= 0 AND returned_amount <= total_amount);
CREATE UNIQUE INDEX IF NOT EXISTS sales_idempotency ON sales(user_id, client_sale_id);
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0 AND returned_quantity <= quantity);
ALTER TABLE credit_sales ADD COLUMN IF NOT EXISTS returned_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (returned_amount >= 0);

CREATE OR REPLACE FUNCTION validate_sale_transaction()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linked_sale sales%ROWTYPE;
BEGIN
  IF NEW.source <> 'venda' THEN RETURN NEW; END IF;
  SELECT * INTO linked_sale FROM sales WHERE user_id=NEW.user_id AND id=NEW.sale_id;
  IF NOT FOUND OR linked_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'transacao deve apontar para uma venda concluida';
  END IF;
  IF linked_sale.payment_method='fiado' THEN
    RAISE EXCEPTION 'venda fiado nao pode gerar entrada antes do pagamento';
  END IF;
  IF linked_sale.total_amount-linked_sale.returned_amount <> NEW.amount THEN
    RAISE EXCEPTION 'valor da entrada difere do total liquido da venda';
  END IF;
  RETURN NEW;
END $$;

-- A dívida de uma venda fiado pode diminuir por devolução parcial. O total
-- original continua imutável na venda e a soma dívida + devolvido deve bater.
CREATE OR REPLACE FUNCTION validate_credit_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linked_sale sales%ROWTYPE;
BEGIN
  SELECT * INTO linked_sale FROM sales WHERE user_id=NEW.user_id AND id=NEW.sale_id;
  IF NOT FOUND OR linked_sale.payment_method<>'fiado' OR linked_sale.status<>'completed' THEN
    RAISE EXCEPTION 'credit_sale deve apontar para uma venda fiado concluida';
  END IF;
  IF linked_sale.customer_id IS DISTINCT FROM NEW.customer_id OR
     linked_sale.total_amount <> NEW.amount + NEW.returned_amount THEN
    RAISE EXCEPTION 'cobranca inconsistente com a venda';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION ensure_fiado_has_credit_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_method='fiado' AND NEW.status='completed' THEN
    IF NOT EXISTS (SELECT 1 FROM credit_sales cs WHERE cs.user_id=NEW.user_id AND cs.sale_id=NEW.id
      AND cs.customer_id=NEW.customer_id AND cs.amount+cs.returned_amount=NEW.total_amount) THEN
      RAISE EXCEPTION 'venda fiado concluida exige uma credit_sale correspondente';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM credit_sales cs WHERE cs.user_id=NEW.user_id AND cs.sale_id=NEW.id) THEN
    RAISE EXCEPTION 'venda cancelada nao pode manter cobranca fiado';
  END IF;
  RETURN NULL;
END $$;

ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS actor_id UUID;
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS actor_role TEXT;
UPDATE admin_audit_logs SET actor_id=admin_user_id, actor_role='admin' WHERE actor_role IS NULL;
ALTER TABLE admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_action_check;
ALTER TABLE admin_audit_logs ADD CONSTRAINT admin_audit_logs_action_check CHECK (action ~ '^[a-z][a-z0-9_.-]{1,99}$');
-- A auditoria global não era acessível pelo runtime. A nova policy expõe somente
-- registros de tenant; linhas administrativas globais permanecem invisíveis.
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_audit_logs FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='admin_audit_logs' AND policyname='tenant_audit_isolation') THEN
    CREATE POLICY tenant_audit_isolation ON admin_audit_logs
      USING (user_id = app_current_user_id()) WITH CHECK (user_id = app_current_user_id() AND actor_role IN ('OWNER','OPERATOR'));
  END IF;
END $$;
GRANT SELECT, INSERT ON admin_audit_logs TO mnb_app_runtime;
CREATE OR REPLACE FUNCTION protect_audit_log() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
  IF TG_OP='UPDATE' AND NEW.admin_user_id IS NULL AND OLD.admin_user_id IS NOT NULL
    AND (to_jsonb(NEW)-'admin_user_id')=(to_jsonb(OLD)-'admin_user_id') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'audit log is append-only';
END $$;
DROP TRIGGER IF EXISTS audit_immutable ON admin_audit_logs;
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON admin_audit_logs FOR EACH ROW EXECUTE FUNCTION protect_audit_log();
COMMIT;
