CREATE TABLE IF NOT EXISTS volunteers_departments (
  volunteer_id INT REFERENCES volunteers(id) ON DELETE CASCADE,
  department_id INT REFERENCES departments(id) ON DELETE CASCADE,
  is_leader BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (volunteer_id, department_id)
);
