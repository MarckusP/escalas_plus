CREATE TABLE IF NOT EXISTS swap_requests (
  id SERIAL PRIMARY KEY,
  requester_id INT REFERENCES volunteers(id) ON DELETE CASCADE,
  target_id INT REFERENCES volunteers(id) ON DELETE CASCADE,
  schedule_id INT REFERENCES schedule(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
  message TEXT,
  reviewed_by INT REFERENCES volunteers(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
