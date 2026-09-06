BEGIN;

-- ============================================================
-- EXTENSOES E CONTEXTO DO TENANT
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- A connection string do Neon normalmente usa neondb_owner, role que possui
-- BYPASSRLS. A API troca para esta role NOLOGIN/NOBYPASSRLS dentro de cada
-- transacao de negocio, fazendo FORCE ROW LEVEL SECURITY valer de fato.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mnb_app_runtime') THEN
    CREATE ROLE mnb_app_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  ELSIF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname = 'mnb_app_runtime' AND (rolsuper OR rolbypassrls OR rolcanlogin)
  ) THEN
    RAISE EXCEPTION 'mnb_app_runtime existe com atributos inseguros';
  END IF;
  EXECUTE format('GRANT mnb_app_runtime TO %I', session_user);
END;
$$;

-- A API deve executar, dentro de cada transacao autenticada:
--   SELECT set_config('app.current_user_id', '<uuid-do-usuario>', true);
-- O terceiro argumento true limita o valor a transacao atual e evita que uma
-- conexao devolvida ao pool vaze o tenant para a proxima requisicao.
CREATE OR REPLACE FUNCTION app_current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID
$$;

COMMENT ON FUNCTION app_current_user_id() IS
  'Retorna o UUID do tenant definido pela API na transacao atual; retorna NULL quando ausente.';

-- ============================================================
-- USUARIOS
-- ============================================================
-- O bloco ALTER tambem atualiza, sem perda, a tabela minima que as primeiras
-- versoes deste projeto criavam com id/email do tipo TEXT.
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  token_version INTEGER NOT NULL DEFAULT 0 CONSTRAINT ck_users_token_version CHECK (token_version >= 0),
  role          TEXT NOT NULL DEFAULT 'client' CONSTRAINT ck_users_role CHECK (role IN ('client', 'admin')),
  status        TEXT NOT NULL DEFAULT 'active' CONSTRAINT ck_users_status CHECK (status IN ('active', 'suspended')),
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE users ALTER COLUMN id TYPE UUID USING id::UUID;
ALTER TABLE users ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE users ALTER COLUMN email TYPE CITEXT USING email::CITEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'client';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_users_token_version') THEN
    ALTER TABLE users ADD CONSTRAINT ck_users_token_version CHECK (token_version >= 0);
  END IF;
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

COMMENT ON TABLE users IS
  'Contas autenticaveis. O hash e produzido pela API com bcrypt/argon2; senhas nunca sao armazenadas.';
COMMENT ON COLUMN users.password_hash IS 'Hash bcrypt/argon2 gerado fora do banco.';

-- Tokens de uso unico para recuperacao de senha. Apenas o hash do token fica
-- armazenado; a API nunca persiste o valor enviado ao usuario.
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_created
  ON password_reset_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expiry
  ON password_reset_tokens (expires_at)
  WHERE used_at IS NULL;

COMMENT ON TABLE password_reset_tokens IS
  'Tokens de uso unico e curta duracao para recuperar senhas sem expor se um e-mail possui conta.';

CREATE TABLE IF NOT EXISTS business_settings (
  user_id               UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  business_name         TEXT NOT NULL CHECK (btrim(business_name) <> ''),
  business_category     TEXT NOT NULL CHECK (btrim(business_category) <> ''),
  offering              TEXT NOT NULL DEFAULT 'ambos' CHECK (offering IN ('produtos', 'servicos', 'ambos')),
  controls_stock        BOOLEAN NOT NULL DEFAULT true,
  daily_sales_goal      NUMERIC(14,2) CHECK (daily_sales_goal IS NULL OR daily_sales_goal >= 0),
  report_frequency      TEXT NOT NULL DEFAULT 'nenhum' CHECK (report_frequency IN ('semanal', 'mensal', 'ambos', 'nenhum')),
  report_by_email       BOOLEAN NOT NULL DEFAULT false,
  report_email          CITEXT,
  view_period           TEXT NOT NULL DEFAULT 'day' CHECK (view_period IN ('day', 'week')),
  onboarding_completed  BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE business_settings IS
  'Preferencias e configuracoes do negocio, persistidas por conta no servidor.';

-- ============================================================
-- CATEGORIAS E PRODUTOS
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT app_current_user_id()
             REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_tenant_id UNIQUE (user_id, id)
);

COMMENT ON TABLE categories IS
  'Colecoes de produtos criadas pelo comerciante, isoladas por user_id.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_user_name_ci
  ON categories (user_id, lower(name));

CREATE TABLE IF NOT EXISTS products (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL DEFAULT app_current_user_id()
                    REFERENCES users(id) ON DELETE CASCADE,
  category_id       UUID,
  kind              TEXT NOT NULL DEFAULT 'product'
                    CHECK (kind IN ('product', 'service')),
  name              TEXT NOT NULL CHECK (btrim(name) <> ''),
  barcode           TEXT,
  sale_price        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  cost_price        NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  stock_quantity    NUMERIC(14,3) CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  minimum_quantity  NUMERIC(14,3) CHECK (minimum_quantity IS NULL OR minimum_quantity >= 0),
  service_duration  INTERVAL,
  active            BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_products_tenant_id UNIQUE (user_id, id),
  CONSTRAINT fk_products_category_same_tenant
    FOREIGN KEY (user_id, category_id)
    REFERENCES categories(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_products_kind_fields CHECK (
    (kind = 'product' AND service_duration IS NULL) OR
    (kind = 'service' AND stock_quantity IS NULL AND minimum_quantity IS NULL)
  )
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS barcode TEXT;

COMMENT ON TABLE products IS
  'Catalogo de produtos e servicos; estoque e precos pertencem sempre ao tenant.';
COMMENT ON COLUMN products.category_id IS
  'Categoria do mesmo user_id. RESTRICT evita apagar uma categoria ainda usada.';

CREATE INDEX IF NOT EXISTS idx_products_user_active
  ON products (user_id, active);
CREATE INDEX IF NOT EXISTS idx_products_user_category
  ON products (user_id, category_id);
CREATE INDEX IF NOT EXISTS idx_products_user_name
  ON products (user_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS uq_products_user_barcode
  ON products (user_id, barcode) WHERE barcode IS NOT NULL;

-- ============================================================
-- CLIENTES
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL DEFAULT app_current_user_id()
             REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  phone      TEXT,
  email      CITEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customers_tenant_id UNIQUE (user_id, id)
);

COMMENT ON TABLE customers IS
  'Clientes do comerciante, inclusive os devedores de vendas a prazo.';

CREATE INDEX IF NOT EXISTS idx_customers_user_name
  ON customers (user_id, lower(name));

-- ============================================================
-- SESSOES DE CAIXA
-- ============================================================
CREATE TABLE IF NOT EXISTS cash_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL DEFAULT app_current_user_id()
                   REFERENCES users(id) ON DELETE CASCADE,
  responsible      TEXT NOT NULL CHECK (btrim(responsible) <> ''),
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at        TIMESTAMPTZ,
  opening_balance  NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
  closing_balance  NUMERIC(14,2),
  expected_balance NUMERIC(14,2),
  difference       NUMERIC(14,2)
                   GENERATED ALWAYS AS (closing_balance - expected_balance) STORED,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_cash_sessions_tenant_id UNIQUE (user_id, id),
  CONSTRAINT ck_cash_sessions_lifecycle CHECK (
    (status = 'open' AND closed_at IS NULL AND closing_balance IS NULL AND expected_balance IS NULL) OR
    (status = 'closed' AND closed_at IS NOT NULL AND closed_at >= opened_at
      AND closing_balance IS NOT NULL AND expected_balance IS NOT NULL)
  )
);

COMMENT ON TABLE cash_sessions IS
  'Historico de aberturas e fechamentos; expected_balance e difference sao snapshots do fechamento.';
COMMENT ON COLUMN cash_sessions.responsible IS
  'Nome exibivel do responsavel pela sessao, preservado como snapshot historico.';

CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_opened
  ON cash_sessions (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_user_closed
  ON cash_sessions (user_id, closed_at DESC) WHERE closed_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open_per_user
  ON cash_sessions (user_id) WHERE status = 'open';

-- ============================================================
-- VENDAS E ITENS
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL DEFAULT app_current_user_id()
                   REFERENCES users(id) ON DELETE CASCADE,
  cash_session_id  UUID,
  customer_id      UUID,
  description      TEXT,
  payment_method   TEXT NOT NULL
                   CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'fiado')),
  status           TEXT NOT NULL DEFAULT 'completed'
                   CHECK (status IN ('completed', 'cancelled')),
  total_amount     NUMERIC(14,2) NOT NULL CHECK (total_amount > 0),
  sold_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sales_tenant_id UNIQUE (user_id, id),
  CONSTRAINT fk_sales_cash_session_same_tenant
    FOREIGN KEY (user_id, cash_session_id)
    REFERENCES cash_sessions(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_sales_customer_same_tenant
    FOREIGN KEY (user_id, customer_id)
    REFERENCES customers(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_sales_credit_customer CHECK (payment_method <> 'fiado' OR customer_id IS NOT NULL),
  CONSTRAINT ck_sales_cancellation CHECK (
    (status = 'completed' AND cancelled_at IS NULL) OR
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
  )
);

COMMENT ON TABLE sales IS
  'Cabecalho comercial da venda. Venda fiado existe aqui, mas nao gera entrada financeira neste momento.';

CREATE INDEX IF NOT EXISTS idx_sales_user_sold
  ON sales (user_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_user_session_sold
  ON sales (user_id, cash_session_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_user_customer_sold
  ON sales (user_id, customer_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_user_payment_status
  ON sales (user_id, payment_method, status);

CREATE TABLE IF NOT EXISTS sale_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL DEFAULT app_current_user_id()
                     REFERENCES users(id) ON DELETE CASCADE,
  sale_id            UUID NOT NULL,
  product_id         UUID,
  product_name       TEXT NOT NULL CHECK (btrim(product_name) <> ''),
  quantity           NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price         NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  unit_cost          NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  total_amount       NUMERIC(14,2)
                     GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_sale_items_tenant_id UNIQUE (user_id, id),
  CONSTRAINT fk_sale_items_sale_same_tenant
    FOREIGN KEY (user_id, sale_id)
    REFERENCES sales(user_id, id) ON DELETE CASCADE,
  CONSTRAINT fk_sale_items_product_same_tenant
    FOREIGN KEY (user_id, product_id)
    REFERENCES products(user_id, id) ON DELETE RESTRICT
);

COMMENT ON TABLE sale_items IS
  'Itens da venda com nome, preco e custo em snapshot para preservar o historico.';

CREATE INDEX IF NOT EXISTS idx_sale_items_user_sale
  ON sale_items (user_id, sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_user_product
  ON sale_items (user_id, product_id);

-- ============================================================
-- DESPESAS FIXAS
-- ============================================================
CREATE TABLE IF NOT EXISTS fixed_expenses (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL DEFAULT app_current_user_id()
                 REFERENCES users(id) ON DELETE CASCADE,
  description    TEXT NOT NULL CHECK (btrim(description) <> ''),
  amount         NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  recurrence     TEXT NOT NULL DEFAULT 'monthly'
                 CHECK (recurrence IN ('weekly', 'monthly', 'yearly', 'once')),
  starts_on      DATE NOT NULL DEFAULT CURRENT_DATE,
  ends_on        DATE,
  next_due_date  DATE,
  due_day        SMALLINT,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_fixed_expenses_tenant_id UNIQUE (user_id, id),
  CONSTRAINT ck_fixed_expenses_dates CHECK (ends_on IS NULL OR ends_on >= starts_on),
  CONSTRAINT ck_fixed_expenses_due_day CHECK (
    due_day IS NULL OR
    (recurrence = 'monthly' AND due_day BETWEEN 1 AND 31) OR
    (recurrence = 'weekly' AND due_day BETWEEN 0 AND 6)
  )
);

COMMENT ON TABLE fixed_expenses IS
  'Definicoes recorrentes de despesas; o pagamento efetivo e registrado em transactions.';
COMMENT ON COLUMN fixed_expenses.due_day IS
  'Dia 1..31 para recorrencia mensal; 0..6 (domingo..sabado) para semanal.';

CREATE INDEX IF NOT EXISTS idx_fixed_expenses_user_active_due
  ON fixed_expenses (user_id, active, next_due_date);

-- ============================================================
-- FIADO
-- ============================================================
CREATE TABLE IF NOT EXISTS credit_sales (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL DEFAULT app_current_user_id()
                REFERENCES users(id) ON DELETE CASCADE,
  sale_id       UUID NOT NULL,
  customer_id   UUID NOT NULL,
  amount        NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  paid_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'parcial', 'pago')),
  due_date      DATE,
  paid_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_credit_sales_tenant_id UNIQUE (user_id, id),
  CONSTRAINT uq_credit_sales_tenant_sale UNIQUE (user_id, sale_id),
  CONSTRAINT fk_credit_sales_sale_same_tenant
    FOREIGN KEY (user_id, sale_id)
    REFERENCES sales(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_credit_sales_customer_same_tenant
    FOREIGN KEY (user_id, customer_id)
    REFERENCES customers(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_credit_sales_amounts CHECK (paid_amount >= 0 AND paid_amount <= amount),
  CONSTRAINT ck_credit_sales_lifecycle CHECK (
    (status = 'pendente' AND paid_amount = 0 AND paid_at IS NULL) OR
    (status = 'parcial' AND paid_amount > 0 AND paid_amount < amount AND paid_at IS NULL) OR
    (status = 'pago' AND paid_amount = amount AND paid_at IS NOT NULL)
  )
);

COMMENT ON TABLE credit_sales IS
  'Dividas de vendas fiado. So pagamentos efetivos geram entradas em transactions.';
COMMENT ON COLUMN credit_sales.paid_amount IS
  'Total recebido, mantido automaticamente pelos lancamentos pagamento_fiado.';

CREATE INDEX IF NOT EXISTS idx_credit_sales_user_status_due
  ON credit_sales (user_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_credit_sales_user_customer_status
  ON credit_sales (user_id, customer_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_sales_user_created
  ON credit_sales (user_id, created_at DESC);

-- ============================================================
-- TRANSACOES FINANCEIRAS (SOMENTE DINHEIRO EFETIVO)
-- ============================================================
CREATE TABLE IF NOT EXISTS transactions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL DEFAULT app_current_user_id()
                    REFERENCES users(id) ON DELETE CASCADE,
  cash_session_id   UUID,
  sale_id           UUID,
  fixed_expense_id  UUID,
  credit_sale_id    UUID,
  type              TEXT NOT NULL CHECK (type IN ('entrada', 'saida')),
  source            TEXT NOT NULL
                    CHECK (source IN ('venda', 'despesa_fixa', 'despesa_avulsa', 'ajuste', 'pagamento_fiado')),
  payment_method    TEXT NOT NULL DEFAULT 'dinheiro'
                    CHECK (payment_method IN ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'outro')),
  amount            NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  description       TEXT,
  movement_kind     TEXT NOT NULL DEFAULT 'regular'
                    CHECK (movement_kind IN ('regular', 'suprimento', 'sangria')),
  entry_kind        TEXT CHECK (entry_kind IN ('produto', 'servico', 'gorjeta')),
  expense_kind      TEXT CHECK (expense_kind IN (
                      'mercadoria', 'fornecedor', 'aluguel', 'energia', 'agua',
                      'internet', 'funcionario', 'combustivel', 'impostos', 'outros'
                    )),
  identification_pending BOOLEAN NOT NULL DEFAULT false,
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_transactions_tenant_id UNIQUE (user_id, id),
  CONSTRAINT fk_transactions_cash_session_same_tenant
    FOREIGN KEY (user_id, cash_session_id)
    REFERENCES cash_sessions(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_sale_same_tenant
    FOREIGN KEY (user_id, sale_id)
    REFERENCES sales(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_fixed_expense_same_tenant
    FOREIGN KEY (user_id, fixed_expense_id)
    REFERENCES fixed_expenses(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_transactions_credit_sale_same_tenant
    FOREIGN KEY (user_id, credit_sale_id)
    REFERENCES credit_sales(user_id, id) ON DELETE RESTRICT,
  CONSTRAINT ck_transactions_source_links CHECK (
    (source = 'venda' AND type = 'entrada' AND sale_id IS NOT NULL
      AND fixed_expense_id IS NULL AND credit_sale_id IS NULL) OR
    (source = 'pagamento_fiado' AND type = 'entrada' AND sale_id IS NULL
      AND fixed_expense_id IS NULL AND credit_sale_id IS NOT NULL) OR
    (source = 'despesa_fixa' AND type = 'saida' AND sale_id IS NULL
      AND fixed_expense_id IS NOT NULL AND credit_sale_id IS NULL) OR
    (source = 'despesa_avulsa' AND type = 'saida' AND sale_id IS NULL
      AND fixed_expense_id IS NULL AND credit_sale_id IS NULL) OR
    (source = 'ajuste' AND sale_id IS NULL
      AND fixed_expense_id IS NULL AND credit_sale_id IS NULL)
  )
);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS movement_kind TEXT NOT NULL DEFAULT 'regular';
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS entry_kind TEXT;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS expense_kind TEXT;
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS identification_pending BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS ck_transactions_identification;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transactions_movement_kind') THEN
    ALTER TABLE transactions ADD CONSTRAINT ck_transactions_movement_kind
      CHECK (movement_kind IN ('regular', 'suprimento', 'sangria'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transactions_entry_kind') THEN
    ALTER TABLE transactions ADD CONSTRAINT ck_transactions_entry_kind
      CHECK (entry_kind IS NULL OR entry_kind IN ('produto', 'servico', 'gorjeta'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transactions_expense_kind') THEN
    ALTER TABLE transactions ADD CONSTRAINT ck_transactions_expense_kind
      CHECK (
        expense_kind IS NULL OR
        (type = 'saida' AND expense_kind IN (
          'mercadoria', 'fornecedor', 'aluguel', 'energia', 'agua',
          'internet', 'funcionario', 'combustivel', 'impostos', 'outros'
        ))
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transactions_identification') THEN
    ALTER TABLE transactions ADD CONSTRAINT ck_transactions_identification
      CHECK (
        (identification_pending = false) OR
        (type = 'entrada' AND entry_kind IN ('produto', 'servico')) OR
        (type = 'saida' AND expense_kind IS NULL)
      );
  END IF;
END;
$$;

COMMENT ON TABLE transactions IS
  'Livro de entradas e saidas efetivamente liquidadas. A criacao da venda fiado nao e inserida aqui.';
COMMENT ON COLUMN transactions.credit_sale_id IS
  'Obrigatorio apenas em pagamento_fiado; cada parcela recebida e uma entrada auditavel.';

CREATE INDEX IF NOT EXISTS idx_transactions_user_occurred
  ON transactions (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_session_occurred
  ON transactions (user_id, cash_session_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_source_occurred
  ON transactions (user_id, source, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_pending
  ON transactions (user_id, cash_session_id, occurred_at DESC)
  WHERE identification_pending;
CREATE INDEX IF NOT EXISTS idx_transactions_user_credit_occurred
  ON transactions (user_id, credit_sale_id, occurred_at DESC)
  WHERE credit_sale_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_transactions_immediate_sale
  ON transactions (user_id, sale_id) WHERE source = 'venda';

-- ============================================================
-- TRIGGERS DE INTEGRIDADE E AUDITORIA
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'users', 'business_settings', 'categories', 'products', 'customers', 'cash_sessions',
    'sales', 'fixed_expenses', 'credit_sales'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_updated_at ON %I', table_name);
    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON %I '
      'FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      table_name
    );
  END LOOP;
END;
$$;

-- Confirma que uma cobranca pertence realmente a uma venda fiado, pelo mesmo
-- valor e cliente. A FK composta ja impede referencias entre tenants.
CREATE OR REPLACE FUNCTION validate_credit_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_sale sales%ROWTYPE;
BEGIN
  SELECT * INTO linked_sale
  FROM sales
  WHERE user_id = NEW.user_id AND id = NEW.sale_id;

  IF NOT FOUND OR linked_sale.payment_method <> 'fiado' OR linked_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'credit_sale deve apontar para uma venda fiado concluida';
  END IF;
  IF linked_sale.customer_id IS DISTINCT FROM NEW.customer_id THEN
    RAISE EXCEPTION 'cliente da cobranca difere do cliente da venda';
  END IF;
  IF linked_sale.total_amount <> NEW.amount THEN
    RAISE EXCEPTION 'valor da cobranca difere do total da venda';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_credit_sale ON credit_sales;
CREATE TRIGGER trg_validate_credit_sale
BEFORE INSERT OR UPDATE OF user_id, sale_id, customer_id, amount ON credit_sales
FOR EACH ROW EXECUTE FUNCTION validate_credit_sale();

-- Os campos de liquidacao da divida sao derivados exclusivamente das entradas
-- pagamento_fiado. Isso impede marcar uma cobranca como paga sem gerar receita.
CREATE OR REPLACE FUNCTION protect_credit_settlement_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.paid_amount <> 0 OR NEW.status <> 'pendente' OR NEW.paid_at IS NOT NULL THEN
      RAISE EXCEPTION 'uma nova cobranca deve iniciar pendente e sem pagamentos';
    END IF;
  ELSIF (NEW.paid_amount, NEW.status, NEW.paid_at)
        IS DISTINCT FROM (OLD.paid_amount, OLD.status, OLD.paid_at)
        AND pg_trigger_depth() < 2 THEN
    RAISE EXCEPTION 'liquidacao deve ser feita por uma transaction pagamento_fiado';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_credit_settlement_fields ON credit_sales;
CREATE TRIGGER trg_protect_credit_settlement_fields
BEFORE INSERT OR UPDATE OF paid_amount, status, paid_at ON credit_sales
FOR EACH ROW EXECUTE FUNCTION protect_credit_settlement_fields();

-- A verificacao e adiada ate o COMMIT para permitir inserir sales primeiro e
-- credit_sales logo depois, na mesma transacao curta.
CREATE OR REPLACE FUNCTION ensure_fiado_has_credit_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.payment_method = 'fiado' AND NEW.status = 'completed' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM credit_sales cs
      WHERE cs.user_id = NEW.user_id
        AND cs.sale_id = NEW.id
        AND cs.customer_id = NEW.customer_id
        AND cs.amount = NEW.total_amount
    ) THEN
      RAISE EXCEPTION 'venda fiado concluida exige uma credit_sale correspondente';
    END IF;
  ELSIF EXISTS (
    SELECT 1 FROM credit_sales cs
    WHERE cs.user_id = NEW.user_id AND cs.sale_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'venda com cobranca fiado nao pode mudar de forma ou ser cancelada';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_fiado_has_credit_sale ON sales;
CREATE CONSTRAINT TRIGGER trg_ensure_fiado_has_credit_sale
AFTER INSERT OR UPDATE OF payment_method, status, customer_id, total_amount ON sales
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION ensure_fiado_has_credit_sale();

-- Impede que uma venda fiado seja lancada como receita imediata. Assim a regra
-- critica nao depende apenas da view ou de um filtro da aplicacao.
CREATE OR REPLACE FUNCTION validate_sale_transaction()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  linked_sale sales%ROWTYPE;
BEGIN
  IF NEW.source <> 'venda' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO linked_sale
  FROM sales
  WHERE user_id = NEW.user_id AND id = NEW.sale_id;

  IF NOT FOUND OR linked_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'transacao deve apontar para uma venda concluida';
  END IF;
  IF linked_sale.payment_method = 'fiado' THEN
    RAISE EXCEPTION 'venda fiado nao pode gerar entrada antes do pagamento';
  END IF;
  IF linked_sale.total_amount <> NEW.amount THEN
    RAISE EXCEPTION 'valor da entrada difere do total da venda';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_10_validate_sale_transaction ON transactions;
CREATE TRIGGER trg_10_validate_sale_transaction
BEFORE INSERT OR UPDATE ON transactions
FOR EACH ROW EXECUTE FUNCTION validate_sale_transaction();

-- Mantem paid_amount/status/paid_at em sincronia com cada recebimento. O UPDATE
-- da divida adquire lock apenas na linha afetada, permitindo pagamentos de
-- tenants diferentes em paralelo e evitando locks longos.
CREATE OR REPLACE FUNCTION sync_credit_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.source = 'pagamento_fiado' THEN
    UPDATE credit_sales
       SET paid_amount = paid_amount - OLD.amount,
           status = CASE
             WHEN paid_amount - OLD.amount = 0 THEN 'pendente'
             ELSE 'parcial'
           END,
           paid_at = NULL
     WHERE user_id = OLD.user_id
       AND id = OLD.credit_sale_id
       AND paid_amount >= OLD.amount;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'nao foi possivel estornar o pagamento fiado';
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.source = 'pagamento_fiado' THEN
    UPDATE credit_sales
       SET paid_amount = paid_amount + NEW.amount,
           status = CASE
             WHEN paid_amount + NEW.amount = amount THEN 'pago'
             ELSE 'parcial'
           END,
           paid_at = CASE
             WHEN paid_amount + NEW.amount = amount THEN NEW.occurred_at
             ELSE NULL
           END
     WHERE user_id = NEW.user_id
       AND id = NEW.credit_sale_id
       AND status <> 'pago'
       AND amount - paid_amount >= NEW.amount;
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    IF affected_rows <> 1 THEN
      RAISE EXCEPTION 'pagamento excede o saldo devedor ou cobranca ja esta paga';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_20_sync_credit_payment ON transactions;
CREATE TRIGGER trg_20_sync_credit_payment
BEFORE INSERT OR UPDATE OR DELETE ON transactions
FOR EACH ROW EXECUTE FUNCTION sync_credit_payment();

-- Fechamento curto e atomico: bloqueia somente a sessao fechada, calcula o
-- esperado a partir do livro financeiro e grava o snapshot historico.
CREATE OR REPLACE FUNCTION close_cash_session(
  p_session_id UUID,
  p_closing_balance NUMERIC,
  p_closed_at TIMESTAMPTZ DEFAULT now()
)
RETURNS cash_sessions
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  tenant_id UUID := app_current_user_id();
  current_session cash_sessions%ROWTYPE;
  expected NUMERIC(14,2);
BEGIN
  IF tenant_id IS NULL THEN
    RAISE EXCEPTION 'app.current_user_id nao foi definido';
  END IF;
  IF p_closing_balance < 0 THEN
    RAISE EXCEPTION 'saldo de fechamento nao pode ser negativo';
  END IF;

  SELECT * INTO current_session
  FROM cash_sessions
  WHERE user_id = tenant_id AND id = p_session_id AND status = 'open'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'sessao aberta nao encontrada para o tenant atual';
  END IF;
  IF p_closed_at < current_session.opened_at THEN
    RAISE EXCEPTION 'fechamento nao pode anteceder a abertura';
  END IF;

  SELECT current_session.opening_balance
       + COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount ELSE -amount END)
           FILTER (WHERE payment_method = 'dinheiro'), 0)
    INTO expected
  FROM transactions
  WHERE user_id = tenant_id AND cash_session_id = p_session_id;

  UPDATE cash_sessions
     SET status = 'closed',
         closed_at = p_closed_at,
         closing_balance = p_closing_balance,
         expected_balance = expected
   WHERE user_id = tenant_id AND id = p_session_id
  RETURNING * INTO current_session;

  RETURN current_session;
END;
$$;

COMMENT ON FUNCTION close_cash_session(UUID, NUMERIC, TIMESTAMPTZ) IS
  'Fecha uma sessao de forma atomica e calcula o saldo esperado pelas transacoes vinculadas.';

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
-- FORCE tambem submete o dono das tabelas as policies (exceto superuser e
-- roles com BYPASSRLS). USING protege leitura/update/delete e WITH CHECK
-- protege insert/update, inclusive contra troca maliciosa de user_id.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'business_settings', 'categories', 'products', 'customers', 'cash_sessions', 'sales',
    'sale_items', 'fixed_expenses', 'credit_sales', 'transactions'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I FOR ALL '
      'USING (user_id = app_current_user_id()) '
      'WITH CHECK (user_id = app_current_user_id())',
      table_name
    );
  END LOOP;
END;
$$;

-- users fica fora do RLS porque registro/login precisam localizar a conta antes
-- de existir um tenant autenticado. Essa tabela deve ser acessivel somente pela
-- role privada da API; nunca por uma role exposta ao cliente.

-- ============================================================
-- VIEWS DE RELATORIO (POSTGRESQL 15+)
-- ============================================================
-- security_invoker faz as views obedecerem ao RLS do usuario que as consulta.
DROP VIEW IF EXISTS daily_balance;
CREATE VIEW daily_balance
WITH (security_invoker = true)
AS
SELECT
  user_id,
  (occurred_at AT TIME ZONE 'UTC')::DATE AS day,
  COALESCE(SUM(amount) FILTER (WHERE type = 'entrada'), 0)::NUMERIC(14,2) AS entradas,
  COALESCE(SUM(amount) FILTER (WHERE type = 'saida'), 0)::NUMERIC(14,2) AS saidas,
  COALESCE(SUM(CASE WHEN type = 'entrada' THEN amount ELSE -amount END), 0)::NUMERIC(14,2) AS saldo
FROM transactions
GROUP BY user_id, (occurred_at AT TIME ZONE 'UTC')::DATE;

COMMENT ON VIEW daily_balance IS
  'Entradas, saidas e saldo por dia UTC. Fiado pendente inexiste em transactions e portanto nao aparece.';

CREATE OR REPLACE VIEW cash_session_report
WITH (security_invoker = true)
AS
SELECT
  cs.user_id,
  cs.id AS cash_session_id,
  cs.responsible,
  cs.opened_at,
  cs.closed_at,
  cs.status,
  cs.opening_balance,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'entrada'), 0)::NUMERIC(14,2) AS entradas,
  COALESCE(SUM(t.amount) FILTER (WHERE t.type = 'saida'), 0)::NUMERIC(14,2) AS saidas,
  (cs.opening_balance
    + COALESCE(SUM(CASE WHEN t.type = 'entrada' THEN t.amount ELSE -t.amount END), 0))::NUMERIC(14,2)
    AS saldo_esperado_atual,
  cs.closing_balance,
  cs.expected_balance AS saldo_esperado_fechamento,
  cs.difference
FROM cash_sessions cs
LEFT JOIN transactions t
  ON t.user_id = cs.user_id AND t.cash_session_id = cs.id
GROUP BY cs.user_id, cs.id;

COMMENT ON VIEW cash_session_report IS
  'Resumo historico de entradas, saidas e saldo agrupado por sessao de caixa.';

CREATE OR REPLACE VIEW credit_receivables
WITH (security_invoker = true)
AS
SELECT
  cs.user_id,
  cs.id AS credit_sale_id,
  cs.sale_id,
  cs.customer_id,
  c.name AS customer_name,
  cs.amount,
  cs.paid_amount,
  (cs.amount - cs.paid_amount)::NUMERIC(14,2) AS outstanding_amount,
  cs.status,
  cs.due_date,
  cs.paid_at,
  cs.created_at
FROM credit_sales cs
JOIN customers c ON c.user_id = cs.user_id AND c.id = cs.customer_id;

COMMENT ON VIEW credit_receivables IS
  'Caderneta com valor original, recebido e saldo devedor por cliente.';

-- Privilegios minimos da role usada pela API depois de autenticar o usuario.
GRANT USAGE ON SCHEMA public TO mnb_app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  business_settings, categories, products, customers, cash_sessions, sales, sale_items,
  fixed_expenses, credit_sales, transactions
TO mnb_app_runtime;
GRANT SELECT ON daily_balance, cash_session_report, credit_receivables TO mnb_app_runtime;
GRANT EXECUTE ON FUNCTION app_current_user_id() TO mnb_app_runtime;
GRANT EXECUTE ON FUNCTION close_cash_session(UUID, NUMERIC, TIMESTAMPTZ) TO mnb_app_runtime;

COMMIT;
