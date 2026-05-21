CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  label VARCHAR(100) NOT NULL,
  path VARCHAR(200) NOT NULL UNIQUE,
  icon VARCHAR(50),
  roles TEXT[] DEFAULT '{"voluntario"}',
  sort_order INT DEFAULT 0
);
