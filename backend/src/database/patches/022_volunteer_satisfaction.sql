-- Satisfação mensal dos voluntários
ALTER TABLE volunteers
  ADD COLUMN IF NOT EXISTS satisfacao_resp SMALLINT NOT NULL DEFAULT 0;

ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS volunteers_satisfacao_resp_check;
ALTER TABLE volunteers ADD CONSTRAINT volunteers_satisfacao_resp_check
  CHECK (satisfacao_resp IN (0, 1));

CREATE TABLE IF NOT EXISTS volunteer_satisfaction (
  id SERIAL PRIMARY KEY,
  volunteer_id INT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  response_date DATE NOT NULL DEFAULT (CURRENT_DATE),
  score SMALLINT NOT NULL CHECK (score >= 1 AND score <= 10),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_volunteer_satisfaction_volunteer
  ON volunteer_satisfaction (volunteer_id, response_date DESC);

CREATE TABLE IF NOT EXISTS scheduler_runs (
  job_name VARCHAR(100) PRIMARY KEY,
  last_run_date DATE NOT NULL
);

CREATE OR REPLACE FUNCTION reset_satisfacao_mensal()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE volunteers
  SET satisfacao_resp = 0
  WHERE role = 'voluntario' AND satisfacao_resp = 1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;
