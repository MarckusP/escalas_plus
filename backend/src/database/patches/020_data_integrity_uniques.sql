-- Normaliza duplicidades antigas antes de criar chaves únicas.

-- 1) Igrejas duplicadas por nome
WITH church_dups AS (
  SELECT c.id AS old_id, k.keep_id
  FROM churches c
  JOIN (
    SELECT name, MIN(id) AS keep_id
    FROM churches
    GROUP BY name
  ) k ON k.name = c.name
  WHERE c.id <> k.keep_id
)
UPDATE departments d
SET church_id = cd.keep_id
FROM church_dups cd
WHERE d.church_id = cd.old_id;

WITH church_dups AS (
  SELECT c.id AS old_id, k.keep_id
  FROM churches c
  JOIN (
    SELECT name, MIN(id) AS keep_id
    FROM churches
    GROUP BY name
  ) k ON k.name = c.name
  WHERE c.id <> k.keep_id
)
UPDATE volunteers v
SET church_id = cd.keep_id
FROM church_dups cd
WHERE v.church_id = cd.old_id;

WITH church_dups AS (
  SELECT c.id AS old_id, k.keep_id
  FROM churches c
  JOIN (
    SELECT name, MIN(id) AS keep_id
    FROM churches
    GROUP BY name
  ) k ON k.name = c.name
  WHERE c.id <> k.keep_id
)
UPDATE events e
SET church_id = cd.keep_id
FROM church_dups cd
WHERE e.church_id = cd.old_id;

WITH church_dups AS (
  SELECT c.id AS old_id, k.keep_id
  FROM churches c
  JOIN (
    SELECT name, MIN(id) AS keep_id
    FROM churches
    GROUP BY name
  ) k ON k.name = c.name
  WHERE c.id <> k.keep_id
)
UPDATE tasks t
SET church_id = cd.keep_id
FROM church_dups cd
WHERE t.church_id = cd.old_id;

DELETE FROM churches c
USING (
  SELECT c1.id
  FROM churches c1
  JOIN (
    SELECT name, MIN(id) AS keep_id
    FROM churches
    GROUP BY name
  ) k ON k.name = c1.name
  WHERE c1.id <> k.keep_id
) dup
WHERE c.id = dup.id;

-- 2) Departamentos duplicados por (name, church_id)
WITH dept_dups AS (
  SELECT d.id AS old_id, k.keep_id
  FROM departments d
  JOIN (
    SELECT name, church_id, MIN(id) AS keep_id
    FROM departments
    GROUP BY name, church_id
  ) k ON k.name = d.name AND k.church_id = d.church_id
  WHERE d.id <> k.keep_id
)
UPDATE roles r
SET department_id = dd.keep_id
FROM dept_dups dd
WHERE r.department_id = dd.old_id;

WITH dept_dups AS (
  SELECT d.id AS old_id, k.keep_id
  FROM departments d
  JOIN (
    SELECT name, church_id, MIN(id) AS keep_id
    FROM departments
    GROUP BY name, church_id
  ) k ON k.name = d.name AND k.church_id = d.church_id
  WHERE d.id <> k.keep_id
)
UPDATE volunteers_departments vd
SET department_id = dd.keep_id
FROM dept_dups dd
WHERE vd.department_id = dd.old_id;

DELETE FROM departments d
USING (
  SELECT d1.id
  FROM departments d1
  JOIN (
    SELECT name, church_id, MIN(id) AS keep_id
    FROM departments
    GROUP BY name, church_id
  ) k ON k.name = d1.name AND k.church_id = d1.church_id
  WHERE d1.id <> k.keep_id
) dup
WHERE d.id = dup.id;

-- 3) Funções duplicadas por (name, department_id)
WITH role_dups AS (
  SELECT r.id AS old_id, k.keep_id
  FROM roles r
  JOIN (
    SELECT name, department_id, MIN(id) AS keep_id
    FROM roles
    GROUP BY name, department_id
  ) k ON k.name = r.name AND k.department_id = r.department_id
  WHERE r.id <> k.keep_id
)
UPDATE volunteer_roles vr
SET role_id = rd.keep_id
FROM role_dups rd
WHERE vr.role_id = rd.old_id;

WITH role_dups AS (
  SELECT r.id AS old_id, k.keep_id
  FROM roles r
  JOIN (
    SELECT name, department_id, MIN(id) AS keep_id
    FROM roles
    GROUP BY name, department_id
  ) k ON k.name = r.name AND k.department_id = r.department_id
  WHERE r.id <> k.keep_id
)
UPDATE schedule s
SET role_id = rd.keep_id
FROM role_dups rd
WHERE s.role_id = rd.old_id;

WITH role_dups AS (
  SELECT r.id AS old_id, k.keep_id
  FROM roles r
  JOIN (
    SELECT name, department_id, MIN(id) AS keep_id
    FROM roles
    GROUP BY name, department_id
  ) k ON k.name = r.name AND k.department_id = r.department_id
  WHERE r.id <> k.keep_id
)
UPDATE event_required_roles err
SET role_id = rd.keep_id
FROM role_dups rd
WHERE err.role_id = rd.old_id;

DELETE FROM roles r
USING (
  SELECT r1.id
  FROM roles r1
  JOIN (
    SELECT name, department_id, MIN(id) AS keep_id
    FROM roles
    GROUP BY name, department_id
  ) k ON k.name = r1.name AND k.department_id = r1.department_id
  WHERE r1.id <> k.keep_id
) dup
WHERE r.id = dup.id;

-- 4) Menus duplicados por path
DELETE FROM menus m
USING (
  SELECT m1.id
  FROM menus m1
  JOIN (
    SELECT path, MIN(id) AS keep_id
    FROM menus
    GROUP BY path
  ) k ON k.path = m1.path
  WHERE m1.id <> k.keep_id
) dup
WHERE m.id = dup.id;

-- 5) Constraints/índices únicos para impedir novas duplicidades
CREATE UNIQUE INDEX IF NOT EXISTS ux_churches_name ON churches(name);
CREATE UNIQUE INDEX IF NOT EXISTS ux_departments_name_church ON departments(name, church_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_roles_name_department ON roles(name, department_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_menus_path ON menus(path);
