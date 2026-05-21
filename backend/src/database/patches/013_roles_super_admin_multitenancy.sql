-- Hierarquia: super_admin, admin, lider, voluntario
-- Multi-tenancy: super_admin com church_id NULL; demais papéis exigem church_id NOT NULL
--
-- Migração de dados existentes:
-- 1) Voluntários sem igreja passam a usar a primeira igreja cadastrada.
-- 2) admin@escalas.com (se existir e for admin) vira super_admin global.
-- 3) Se ainda não houver nenhum super_admin, o admin com menor id vira super_admin.
--
-- Para outro e-mail como super_admin, rode manualmente após a migration:
-- UPDATE volunteers SET role = 'super_admin', church_id = NULL WHERE email = 'seu@email.com';

ALTER TABLE volunteers DROP CONSTRAINT IF EXISTS volunteers_role_check;

UPDATE volunteers SET church_id = (SELECT id FROM churches ORDER BY id LIMIT 1)
WHERE church_id IS NULL;

UPDATE volunteers SET role = 'super_admin', church_id = NULL
WHERE email = 'admin@escalas.com' AND role = 'admin';

UPDATE volunteers SET role = 'super_admin', church_id = NULL
WHERE id = (SELECT MIN(id) FROM volunteers v WHERE v.role = 'admin')
AND NOT EXISTS (SELECT 1 FROM volunteers WHERE role = 'super_admin');

ALTER TABLE volunteers ADD CONSTRAINT volunteers_role_check
  CHECK (role IN ('super_admin', 'admin', 'lider', 'voluntario'));

ALTER TABLE volunteers ADD CONSTRAINT volunteers_church_scope_check
  CHECK (role = 'super_admin' OR church_id IS NOT NULL);
