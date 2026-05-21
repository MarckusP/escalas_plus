CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT,
  link_path VARCHAR(255),
  church_id INT REFERENCES churches(id) ON DELETE SET NULL,
  reference_type VARCHAR(30),
  reference_id INT,
  reference_completed_at TIMESTAMP,
  dedupe_key VARCHAR(255) NOT NULL,
  read_at TIMESTAMP,
  toast_shown_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (recipient_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON notifications (recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_purge
  ON notifications (read_at, reference_completed_at)
  WHERE read_at IS NOT NULL;

CREATE OR REPLACE FUNCTION purge_read_notifications_after_completion()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected INTEGER;
BEGIN
  DELETE FROM notifications
  WHERE read_at IS NOT NULL
    AND reference_completed_at IS NOT NULL
    AND reference_completed_at < (NOW() - INTERVAL '14 days');
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
