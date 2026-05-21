CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  event_date DATE NOT NULL,
  church_id INT REFERENCES churches(id) ON DELETE CASCADE,
  address TEXT,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
