INSERT INTO churches (name, address) VALUES
  ('Igreja Central', 'Rua Principal, 100'),
  ('Igreja Filial', 'Av. Secundária, 200')
ON CONFLICT DO NOTHING;

INSERT INTO departments (name, icon, church_id) VALUES
  ('Louvor', '🎵', 1),
  ('Recepção', '👋', 1),
  ('Mídia', '🎬', 1),
  ('Infantil', '🧒', 1),
  ('Segurança', '🛡️', 1),
  ('Louvor', '🎵', 2),
  ('Recepção', '👋', 2),
  ('Mídia', '🎬', 2),
  ('Infantil', '🧒', 2),
  ('Segurança', '🛡️', 2)
ON CONFLICT DO NOTHING;

INSERT INTO roles (name, department_id)
SELECT role_name, d.id
FROM (
  VALUES
    ('Louvor', 'Vocal'),
    ('Louvor', 'Guitarrista'),
    ('Louvor', 'Baixo'),
    ('Louvor', 'Bateria'),
    ('Louvor', 'Teclado'),
    ('Mídia', 'Operador de Som'),
    ('Mídia', 'Câmera'),
    ('Recepção', 'Recepcionista'),
    ('Infantil', 'Professor'),
    ('Segurança', 'Portaria')
) AS role_seed(dept_name, role_name)
JOIN departments d ON d.name = role_seed.dept_name
ON CONFLICT DO NOTHING;


INSERT INTO menus (label, path, icon, roles, sort_order) VALUES
  ('Dashboard', '/admin', '◉', '{"super_admin","admin","lider"}', 1),
  ('Montar Escala', '/admin/escalas/montar', '🔧', '{"super_admin","admin","lider"}', 2),
  ('Visualizar Escalas', '/admin/escalas/visualizar', '📅', '{"super_admin","admin","lider"}', 3),
  ('Escalas Rápidas', '/escalas-rapidas', '⚡', '{"super_admin","admin","lider"}', 4),
  ('Voluntários', '/admin/pessoas/voluntarios', '👥', '{"super_admin","admin"}', 5),
  ('Check-in', '/admin/pessoas/checkin', '✅', '{"super_admin","admin","lider"}', 6),
  ('Departamentos', '/admin/organizacao/departamentos', '🏢', '{"super_admin","admin"}', 7),
  ('Minhas Escalas', '/escalas', '📋', '{"voluntario","lider"}', 1),
  ('Disponibilidade', '/disponibilidade', '🗓', '{"voluntario","lider"}', 2),
  ('Trocas', '/trocas', '🔄', '{"voluntario","lider","admin","super_admin"}', 3),
  ('Tarefas', '/tarefas', '✓', '{"voluntario","lider","admin","super_admin"}', 4)
ON CONFLICT DO NOTHING;
