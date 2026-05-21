ALTER TABLE swap_requests
  ADD COLUMN IF NOT EXISTS staff_approved_by INT REFERENCES volunteers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS staff_approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS target_approved_by INT REFERENCES volunteers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_approved_at TIMESTAMP;

ALTER TABLE swap_requests
  DROP CONSTRAINT IF EXISTS swap_requests_status_check;

UPDATE swap_requests
SET status = CASE
  WHEN status = 'pendente' THEN 'aguardando_aprovacao'
  ELSE status
END;

ALTER TABLE swap_requests
  ADD CONSTRAINT swap_requests_status_check
  CHECK (status IN ('aguardando_aprovacao', 'aprovado', 'recusado'));
