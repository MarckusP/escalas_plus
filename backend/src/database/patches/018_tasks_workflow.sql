ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS church_id INT REFERENCES churches(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'novo',
  ADD COLUMN IF NOT EXISTS requested_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS requested_status_by INT REFERENCES volunteers(id) ON DELETE SET NULL;

UPDATE tasks
SET status = CASE WHEN done IS TRUE THEN 'entregue' ELSE 'novo' END
WHERE status IS NULL;

ALTER TABLE tasks
  ALTER COLUMN status SET DEFAULT 'novo';

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check CHECK (status IN ('novo', 'fazendo', 'entregue'));

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_requested_status_check;

ALTER TABLE tasks
  ADD CONSTRAINT tasks_requested_status_check
  CHECK (requested_status IS NULL OR requested_status IN ('novo', 'fazendo', 'entregue'));

UPDATE tasks t
SET church_id = COALESCE(
  (SELECT v.church_id FROM volunteers v WHERE v.id = t.assigned_to),
  (SELECT v2.church_id FROM volunteers v2 WHERE v2.id = t.created_by)
)
WHERE church_id IS NULL;
