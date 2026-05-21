CREATE TABLE IF NOT EXISTS volunteer_roles (
  volunteer_id INT REFERENCES volunteers(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (volunteer_id, role_id)
);
