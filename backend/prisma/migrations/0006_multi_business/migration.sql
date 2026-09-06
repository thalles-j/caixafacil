BEGIN;

-- O negócio passa a ser o tenant real. O UUID do primeiro negócio é igual ao
-- tenant legado para que todas as linhas existentes sejam migradas sem cópia.
CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  category TEXT NOT NULL DEFAULT 'Outros',
  offering TEXT NOT NULL DEFAULT 'ambos' CHECK (offering IN ('produtos','servicos','ambos')),
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO businesses(id,owner_user_id,name,category,offering,created_at,updated_at)
SELECT m.user_id,m.actor_id,COALESCE(bs.business_name,u.name,'Meu Negócio'),
       COALESCE(bs.business_category,'Outros'),COALESCE(bs.offering,'ambos'),
       COALESCE(bs.created_at,u.created_at),COALESCE(bs.updated_at,u.updated_at)
FROM tenant_memberships m
JOIN users u ON u.id=m.actor_id
LEFT JOIN business_settings bs ON bs.user_id=m.user_id
WHERE m.role='OWNER'
  AND NOT EXISTS (SELECT 1 FROM businesses existing WHERE existing.owner_user_id=m.actor_id)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS business_memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  role tenant_role NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,business_id)
);

INSERT INTO business_memberships(user_id,business_id,role,active,created_at)
SELECT m.actor_id,m.user_id,m.role,m.active,m.created_at
FROM tenant_memberships m JOIN businesses b ON b.id=m.user_id
ON CONFLICT (user_id,business_id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_business_memberships_business ON business_memberships(business_id,role,active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_operator_single_business
  ON business_memberships(user_id) WHERE role='OPERATOR' AND active;

-- A aplicação valida o limite antes da escrita; o trigger fecha a condição de
-- corrida com lock no login do dono.
CREATE OR REPLACE FUNCTION app_max_businesses_per_owner() RETURNS INTEGER
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT 3 $$;
CREATE OR REPLACE FUNCTION enforce_owner_business_limit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE owner_count INTEGER;
BEGIN
  IF NEW.role <> 'OWNER' OR NEW.active = false THEN RETURN NEW; END IF;
  PERFORM 1 FROM users WHERE id=NEW.user_id FOR UPDATE;
  SELECT count(*) INTO owner_count FROM business_memberships
   WHERE user_id=NEW.user_id AND role='OWNER' AND active
     AND business_id<>NEW.business_id;
  IF owner_count >= app_max_businesses_per_owner() THEN
    RAISE EXCEPTION 'limite de 3 negócios por login atingido' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_owner_business_limit ON business_memberships;
CREATE TRIGGER trg_owner_business_limit BEFORE INSERT OR UPDATE OF active,role
ON business_memberships FOR EACH ROW EXECUTE FUNCTION enforce_owner_business_limit();

CREATE OR REPLACE FUNCTION app_current_business_id() RETURNS UUID
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT NULLIF(current_setting('app.current_business_id', true), '')::UUID
$$;

-- Mantém user_id apenas como referência legada ao dono. business_id é a chave
-- de isolamento, de relacionamento e de todas as consultas operacionais novas.
ALTER TABLE business_settings ADD COLUMN IF NOT EXISTS business_id UUID;
UPDATE business_settings SET business_id=user_id WHERE business_id IS NULL;
ALTER TABLE business_settings ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE business_settings ALTER COLUMN business_id SET DEFAULT app_current_business_id();
ALTER TABLE business_settings ALTER COLUMN user_id SET DEFAULT app_current_user_id();
ALTER TABLE business_settings DROP CONSTRAINT IF EXISTS business_settings_pkey;
ALTER TABLE business_settings ADD CONSTRAINT business_settings_pkey PRIMARY KEY(business_id);
DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','customers','cash_sessions','sales','sale_items','fixed_expenses','credit_sales','transactions'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS business_id UUID',t);
    EXECUTE format('UPDATE %I SET business_id=user_id WHERE business_id IS NULL',t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN business_id SET NOT NULL',t);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN business_id SET DEFAULT app_current_business_id()',t);
  END LOOP;
END $$;
ALTER TABLE privacy_erasure_tombstones ADD COLUMN IF NOT EXISTS business_id UUID;
UPDATE privacy_erasure_tombstones SET business_id=user_id WHERE business_id IS NULL;
ALTER TABLE privacy_erasure_tombstones ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE privacy_erasure_tombstones ALTER COLUMN business_id SET DEFAULT app_current_business_id();
ALTER TABLE privacy_erasure_tombstones DROP CONSTRAINT IF EXISTS privacy_erasure_tombstones_pkey;
ALTER TABLE privacy_erasure_tombstones ADD CONSTRAINT privacy_erasure_tombstones_pkey PRIMARY KEY(business_id,customer_id);
ALTER TABLE admin_audit_logs ADD COLUMN IF NOT EXISTS business_id UUID;
ALTER TABLE admin_audit_logs DISABLE TRIGGER audit_immutable;
UPDATE admin_audit_logs SET business_id=user_id WHERE business_id IS NULL AND user_id IS NOT NULL;
ALTER TABLE admin_audit_logs ENABLE TRIGGER audit_immutable;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS business_id UUID;
UPDATE auth_sessions SET business_id=user_id WHERE business_id IS NULL;

DO $$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['categories','products','customers','cash_sessions','sales','sale_items','fixed_expenses','credit_sales','transactions'] LOOP
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS uq_%s_business_id ON %I(business_id,id)',t,t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_business ON %I(business_id)',t,t);
  END LOOP;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_business_name_ci ON categories(business_id,lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_business_barcode ON products(business_id,barcode) WHERE barcode IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open_business ON cash_sessions(business_id) WHERE status='open';
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_business_client_sale ON sales(business_id,client_sale_id) WHERE client_sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_credit_sales_business_sale ON credit_sales(business_id,sale_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_business_sale ON transactions(business_id,sale_id) WHERE source='venda';
DROP INDEX IF EXISTS uq_categories_user_name_ci;
DROP INDEX IF EXISTS uq_products_user_barcode;
DROP INDEX IF EXISTS uq_cash_sessions_one_open_per_user;
DROP INDEX IF EXISTS sales_idempotency;
DROP INDEX IF EXISTS uq_transactions_immediate_sale;

-- Relações compostas impedem referências entre dois negócios do mesmo dono.
ALTER TABLE products DROP CONSTRAINT IF EXISTS fk_products_category_business;
ALTER TABLE products ADD CONSTRAINT fk_products_category_business FOREIGN KEY(business_id,category_id) REFERENCES categories(business_id,id) ON DELETE RESTRICT;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS fk_sales_cash_business;
ALTER TABLE sales ADD CONSTRAINT fk_sales_cash_business FOREIGN KEY(business_id,cash_session_id) REFERENCES cash_sessions(business_id,id) ON DELETE RESTRICT;
ALTER TABLE sales DROP CONSTRAINT IF EXISTS fk_sales_customer_business;
ALTER TABLE sales ADD CONSTRAINT fk_sales_customer_business FOREIGN KEY(business_id,customer_id) REFERENCES customers(business_id,id) ON DELETE RESTRICT;
ALTER TABLE sale_items DROP CONSTRAINT IF EXISTS fk_sale_items_sale_business;
ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_sale_business FOREIGN KEY(business_id,sale_id) REFERENCES sales(business_id,id) ON DELETE CASCADE;
ALTER TABLE sale_items DROP CONSTRAINT IF EXISTS fk_sale_items_product_business;
ALTER TABLE sale_items ADD CONSTRAINT fk_sale_items_product_business FOREIGN KEY(business_id,product_id) REFERENCES products(business_id,id) ON DELETE RESTRICT;
ALTER TABLE credit_sales DROP CONSTRAINT IF EXISTS fk_credit_sales_sale_business;
ALTER TABLE credit_sales ADD CONSTRAINT fk_credit_sales_sale_business FOREIGN KEY(business_id,sale_id) REFERENCES sales(business_id,id) ON DELETE RESTRICT;
ALTER TABLE credit_sales DROP CONSTRAINT IF EXISTS fk_credit_sales_customer_business;
ALTER TABLE credit_sales ADD CONSTRAINT fk_credit_sales_customer_business FOREIGN KEY(business_id,customer_id) REFERENCES customers(business_id,id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_cash_business;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_cash_business FOREIGN KEY(business_id,cash_session_id) REFERENCES cash_sessions(business_id,id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_sale_business;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_sale_business FOREIGN KEY(business_id,sale_id) REFERENCES sales(business_id,id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_expense_business;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_expense_business FOREIGN KEY(business_id,fixed_expense_id) REFERENCES fixed_expenses(business_id,id) ON DELETE RESTRICT;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS fk_transactions_credit_business;
ALTER TABLE transactions ADD CONSTRAINT fk_transactions_credit_business FOREIGN KEY(business_id,credit_sale_id) REFERENCES credit_sales(business_id,id) ON DELETE RESTRICT;

-- Recria integridade financeira com o negócio como parte obrigatória da chave.
CREATE OR REPLACE FUNCTION validate_credit_sale() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linked_sale sales%ROWTYPE; BEGIN
 SELECT * INTO linked_sale FROM sales WHERE business_id=NEW.business_id AND id=NEW.sale_id;
 IF NOT FOUND OR linked_sale.payment_method<>'fiado' OR linked_sale.status<>'completed' THEN RAISE EXCEPTION 'credit_sale deve apontar para venda fiado concluida do mesmo negocio'; END IF;
 IF linked_sale.customer_id IS DISTINCT FROM NEW.customer_id OR linked_sale.total_amount<>NEW.amount+NEW.returned_amount THEN RAISE EXCEPTION 'dados da cobranca diferem da venda'; END IF;
 RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_validate_credit_sale ON credit_sales;
CREATE TRIGGER trg_validate_credit_sale BEFORE INSERT OR UPDATE OF business_id,sale_id,customer_id,amount ON credit_sales FOR EACH ROW EXECUTE FUNCTION validate_credit_sale();

CREATE OR REPLACE FUNCTION ensure_fiado_has_credit_sale() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.payment_method='fiado' AND NEW.status='completed' AND NOT EXISTS
   (SELECT 1 FROM credit_sales cs WHERE cs.business_id=NEW.business_id AND cs.sale_id=NEW.id AND cs.customer_id=NEW.customer_id AND cs.amount+cs.returned_amount=NEW.total_amount)
 THEN RAISE EXCEPTION 'venda fiado concluida exige cobranca correspondente'; END IF;
 RETURN NULL; END $$;

CREATE OR REPLACE FUNCTION validate_sale_transaction() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE linked_sale sales%ROWTYPE; BEGIN
 IF NEW.source<>'venda' THEN RETURN NEW; END IF;
 SELECT * INTO linked_sale FROM sales WHERE business_id=NEW.business_id AND id=NEW.sale_id;
 IF NOT FOUND OR linked_sale.status<>'completed' OR linked_sale.payment_method='fiado' OR linked_sale.total_amount-linked_sale.returned_amount<>NEW.amount THEN RAISE EXCEPTION 'transacao de venda invalida'; END IF;
 RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION sync_credit_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE affected_rows INTEGER; BEGIN
 IF TG_OP IN ('UPDATE','DELETE') AND OLD.source='pagamento_fiado' THEN
  UPDATE credit_sales SET paid_amount=paid_amount-OLD.amount,status=CASE WHEN paid_amount-OLD.amount=0 THEN 'pendente' ELSE 'parcial' END,paid_at=NULL
   WHERE business_id=OLD.business_id AND id=OLD.credit_sale_id AND paid_amount>=OLD.amount;
  GET DIAGNOSTICS affected_rows=ROW_COUNT; IF affected_rows<>1 THEN RAISE EXCEPTION 'nao foi possivel estornar pagamento fiado'; END IF;
 END IF;
 IF TG_OP IN ('INSERT','UPDATE') AND NEW.source='pagamento_fiado' THEN
  UPDATE credit_sales SET paid_amount=paid_amount+NEW.amount,status=CASE WHEN paid_amount+NEW.amount=amount THEN 'pago' ELSE 'parcial' END,
   paid_at=CASE WHEN paid_amount+NEW.amount=amount THEN NEW.occurred_at ELSE NULL END
   WHERE business_id=NEW.business_id AND id=NEW.credit_sale_id AND status<>'pago' AND amount-paid_amount>=NEW.amount;
  GET DIAGNOSTICS affected_rows=ROW_COUNT; IF affected_rows<>1 THEN RAISE EXCEPTION 'pagamento excede saldo devedor'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION close_cash_session(p_session_id UUID,p_closing_balance NUMERIC,p_closed_at TIMESTAMPTZ DEFAULT now())
RETURNS cash_sessions LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE tenant_id UUID:=app_current_business_id(); current_session cash_sessions%ROWTYPE; expected NUMERIC(14,2); BEGIN
 IF tenant_id IS NULL THEN RAISE EXCEPTION 'app.current_business_id nao definido'; END IF;
 SELECT * INTO current_session FROM cash_sessions WHERE business_id=tenant_id AND id=p_session_id AND status='open' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'sessao aberta nao encontrada'; END IF;
 SELECT current_session.opening_balance+COALESCE(SUM(CASE WHEN type='entrada' THEN amount ELSE -amount END) FILTER(WHERE payment_method='dinheiro'),0)
 INTO expected FROM transactions WHERE business_id=tenant_id AND cash_session_id=p_session_id;
 UPDATE cash_sessions SET status='closed',closed_at=p_closed_at,closing_balance=p_closing_balance,expected_balance=expected
 WHERE business_id=tenant_id AND id=p_session_id RETURNING * INTO current_session; RETURN current_session; END $$;

-- RLS compara somente business_id com a configuração transacional definida
-- pelo servidor após validateSession confirmar o vínculo em cada requisição.
DO $$ DECLARE t TEXT; BEGIN
 FOREACH t IN ARRAY ARRAY['business_settings','categories','products','customers','cash_sessions','sales','sale_items','fixed_expenses','credit_sales','transactions','privacy_erasure_tombstones'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I',t);
  EXECUTE format('DROP POLICY IF EXISTS privacy_erasure_isolation ON %I',t);
  EXECUTE format('DROP POLICY IF EXISTS business_isolation ON %I',t);
  EXECUTE format('CREATE POLICY business_isolation ON %I FOR ALL USING(business_id=app_current_business_id()) WITH CHECK(business_id=app_current_business_id())',t);
 END LOOP;
END $$;
DROP POLICY IF EXISTS tenant_audit_isolation ON admin_audit_logs;
CREATE POLICY tenant_audit_isolation ON admin_audit_logs USING(business_id=app_current_business_id()) WITH CHECK(business_id=app_current_business_id() AND actor_role IN('OWNER','OPERATOR'));
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE businesses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS businesses_active_isolation ON businesses;
CREATE POLICY businesses_active_isolation ON businesses USING(id=app_current_business_id()) WITH CHECK(id=app_current_business_id());
ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS business_memberships_active_isolation ON business_memberships;
CREATE POLICY business_memberships_active_isolation ON business_memberships USING(business_id=app_current_business_id()) WITH CHECK(business_id=app_current_business_id());

DROP VIEW IF EXISTS daily_balance;
CREATE VIEW daily_balance WITH(security_invoker=true) AS SELECT business_id,(occurred_at AT TIME ZONE 'UTC')::date AS day,
 COALESCE(sum(amount) FILTER(WHERE type='entrada'),0)::numeric(14,2) entradas,
 COALESCE(sum(amount) FILTER(WHERE type='saida'),0)::numeric(14,2) saidas,
 COALESCE(sum(CASE WHEN type='entrada' THEN amount ELSE -amount END),0)::numeric(14,2) saldo
 FROM transactions GROUP BY business_id,(occurred_at AT TIME ZONE 'UTC')::date;
DROP VIEW IF EXISTS cash_session_report;
CREATE VIEW cash_session_report WITH(security_invoker=true) AS SELECT cs.business_id,cs.id cash_session_id,cs.responsible,cs.opened_at,cs.closed_at,cs.status,cs.opening_balance,
 COALESCE(sum(t.amount) FILTER(WHERE t.type='entrada'),0)::numeric(14,2) entradas,COALESCE(sum(t.amount) FILTER(WHERE t.type='saida'),0)::numeric(14,2) saidas,
 (cs.opening_balance+COALESCE(sum(CASE WHEN t.type='entrada' THEN t.amount ELSE -t.amount END),0))::numeric(14,2) saldo_esperado_atual,
 cs.closing_balance,cs.expected_balance saldo_esperado_fechamento,cs.difference FROM cash_sessions cs LEFT JOIN transactions t ON t.business_id=cs.business_id AND t.cash_session_id=cs.id GROUP BY cs.business_id,cs.id;
DROP VIEW IF EXISTS credit_receivables;
CREATE VIEW credit_receivables WITH(security_invoker=true) AS SELECT cs.business_id,cs.id credit_sale_id,cs.sale_id,cs.customer_id,c.name customer_name,cs.amount,cs.paid_amount,
 (cs.amount-cs.paid_amount)::numeric(14,2) outstanding_amount,cs.status,cs.due_date,cs.paid_at,cs.created_at FROM credit_sales cs JOIN customers c ON c.business_id=cs.business_id AND c.id=cs.customer_id;

GRANT SELECT,INSERT,UPDATE,DELETE ON businesses,business_memberships TO mnb_app_runtime;
GRANT EXECUTE ON FUNCTION app_current_business_id() TO mnb_app_runtime;
GRANT EXECUTE ON FUNCTION app_max_businesses_per_owner() TO mnb_app_runtime;

COMMIT;
