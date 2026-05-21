CREATE TABLE IF NOT EXISTS unavailability (
  id SERIAL PRIMARY KEY,
  volunteer_id INT NOT NULL REFERENCES volunteers(id) ON DELETE CASCADE,
  exception_date DATE NOT NULL,
  period VARCHAR(20) NOT NULL CHECK (period IN ('manha', 'tarde', 'noite', 'todos')),
  series_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (volunteer_id, exception_date, period)
);

CREATE INDEX IF NOT EXISTS idx_unavailability_volunteer_date ON unavailability (volunteer_id, exception_date);
