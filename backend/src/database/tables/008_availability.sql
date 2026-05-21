CREATE TABLE IF NOT EXISTS availability (
  id SERIAL PRIMARY KEY,
  volunteer_id INT REFERENCES volunteers(id) ON DELETE CASCADE,
  day_of_week INT CHECK (day_of_week BETWEEN 0 AND 6),
  period VARCHAR(20) CHECK (period IN ('manha', 'tarde', 'noite')),
  available BOOLEAN DEFAULT TRUE,
  UNIQUE (volunteer_id, day_of_week, period)
);
