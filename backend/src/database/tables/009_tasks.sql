CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300) NOT NULL,
  description TEXT,
  assigned_to INT REFERENCES volunteers(id) ON DELETE SET NULL,
  created_by INT REFERENCES volunteers(id) ON DELETE SET NULL,
  priority VARCHAR(10) DEFAULT 'media' CHECK (priority IN ('alta', 'media', 'baixa')),
  done BOOLEAN DEFAULT FALSE,
  due_date DATE,
  created_at TIMESTAMP DEFAULT NOW()
);
