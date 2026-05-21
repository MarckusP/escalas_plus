-- Alterar a tabela events para suportar horário e recorrência
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_time TIME;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20); -- 'daily', 'weekly', 'custom'
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_interval INT; -- intervalo de dias
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_count INT; -- número de ocorrências
ALTER TABLE events ADD COLUMN IF NOT EXISTS parent_event_id INT REFERENCES events(id) ON DELETE CASCADE;

-- Criar tabela para funções requeridas em cada evento
CREATE TABLE IF NOT EXISTS event_required_roles (
  id SERIAL PRIMARY KEY,
  event_id INT REFERENCES events(id) ON DELETE CASCADE,
  role_id INT REFERENCES roles(id) ON DELETE CASCADE,
  quantity INT DEFAULT 1,
  UNIQUE(event_id, role_id)
);
