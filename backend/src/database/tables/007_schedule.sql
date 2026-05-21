CREATE TABLE IF NOT EXISTS schedule (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  volunteer_id INT REFERENCES volunteers(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE SET NULL,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('confirmado', 'pendente', 'recusado')),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (event_id, volunteer_id, role_id)
);
