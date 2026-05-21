-- Telefone em volunteers: 003 já cria estas colunas em instalações novas;
-- bases criadas com 003 antigo precisam do ALTER. Idempotente para evitar 42701.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'volunteers' AND column_name = 'phone_ddd'
  ) THEN
    ALTER TABLE volunteers ADD COLUMN phone_ddd VARCHAR(3);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'volunteers' AND column_name = 'phone_number'
  ) THEN
    ALTER TABLE volunteers ADD COLUMN phone_number VARCHAR(20);
  END IF;
END $$;
