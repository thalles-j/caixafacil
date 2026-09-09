BEGIN;

-- Colunas na tabela existente: isolamento e FORCE RLS permanecem inalterados.
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_consent_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_consent_version TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS whatsapp_consent_recorded_by UUID;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS privacy_erasure_tombstones (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL,
  anonymized_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,customer_id)
);
ALTER TABLE privacy_erasure_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_erasure_tombstones FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='privacy_erasure_tombstones' AND policyname='privacy_erasure_isolation') THEN
    CREATE POLICY privacy_erasure_isolation ON privacy_erasure_tombstones
      USING (user_id=app_current_user_id()) WITH CHECK (user_id=app_current_user_id());
  END IF;
END $$;
GRANT SELECT,INSERT ON privacy_erasure_tombstones TO mnb_app_runtime;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_customers_whatsapp_consent_complete') THEN
    ALTER TABLE customers ADD CONSTRAINT ck_customers_whatsapp_consent_complete CHECK (
      (whatsapp_consent_at IS NULL AND whatsapp_consent_version IS NULL AND whatsapp_consent_recorded_by IS NULL)
      OR (whatsapp_consent_at IS NOT NULL AND whatsapp_consent_version IS NOT NULL AND whatsapp_consent_recorded_by IS NOT NULL)
    );
  END IF;
END;
$$;

-- Uma autorização para o número antigo nunca autoriza um telefone novo.
CREATE OR REPLACE FUNCTION protect_customer_privacy()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.anonymized_at IS NOT NULL THEN
    NEW.name := 'Cliente anonimizado';
    NEW.phone := NULL;
    NEW.email := NULL;
    NEW.notes := NULL;
    NEW.anonymized_at := OLD.anonymized_at;
  END IF;
  IF NEW.phone IS DISTINCT FROM OLD.phone OR NEW.anonymized_at IS NOT NULL THEN
    NEW.whatsapp_consent_at := NULL;
    NEW.whatsapp_consent_version := NULL;
    NEW.whatsapp_consent_recorded_by := NULL;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_customer_privacy ON customers;
CREATE TRIGGER trg_protect_customer_privacy BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION protect_customer_privacy();

COMMIT;
