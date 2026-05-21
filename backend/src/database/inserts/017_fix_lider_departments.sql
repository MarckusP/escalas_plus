-- Garantir que líder é líder do departamento Louvor (id=1)
INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
SELECT v.id, 1, TRUE FROM volunteers v WHERE v.email = 'lider@escalas.com'
ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = TRUE;

-- Garantir que voluntários demo estão no mesmo ministério do líder
INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
SELECT v.id, 1, FALSE FROM volunteers v WHERE v.email = 'voluntario@escalas.com'
ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader;

INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
SELECT v.id, 1, FALSE FROM volunteers v WHERE v.email = 'ana.voluntaria@escalas.com'
ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader;

INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
SELECT v.id, 1, FALSE FROM volunteers v WHERE v.email = 'carlos.voluntario@escalas.com'
ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader;

INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
SELECT v.id, 1, FALSE FROM volunteers v WHERE v.email = 'juliana.voluntaria@escalas.com'
ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader;
