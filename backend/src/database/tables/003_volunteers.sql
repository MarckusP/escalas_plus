CREATE TABLE IF NOT EXISTS volunteers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) DEFAULT 'voluntario' CHECK (role IN ('super_admin', 'admin', 'lider', 'voluntario')),
  church_id INT REFERENCES churches(id) ON DELETE SET NULL,
  phone_ddd VARCHAR(3),
  phone_number VARCHAR(20),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);
