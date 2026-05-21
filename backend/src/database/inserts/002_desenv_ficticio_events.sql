-- Eventos fictícios (somente aplicado quando APP_MODE=teste — ver runMigrations.ts)
-- Data >= 14 dias e horário definidos para permitir teste de troca de escalas (>12h)
INSERT INTO events (name, event_date, church_id, address, description, event_time)
SELECT 'Culto Dominical (Demo)', (CURRENT_DATE + INTERVAL '14 days')::date, 1, 'Templo sede', 'Seed desenvolvimento — dados fictícios', '19:00:00'::time
WHERE EXISTS (SELECT 1 FROM churches WHERE id = 1)
AND NOT EXISTS (SELECT 1 FROM events WHERE name = 'Culto Dominical (Demo)');

INSERT INTO events (name, event_date, church_id, address, description, event_time)
SELECT 'Ensaio Geral Louvor', (CURRENT_DATE + INTERVAL '14 days')::date, 1, 'Templo sede', 'Seed desenvolvimento — dados fictícios', '19:00:00'::time
WHERE EXISTS (SELECT 1 FROM churches WHERE id = 1)
AND NOT EXISTS (SELECT 1 FROM events WHERE name = 'Ensaio Geral Louvor');
