-- Adiciona a coluna status na tabela volunteers
ALTER TABLE volunteers
ADD COLUMN status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'rejected'));

-- Atualiza os voluntários existentes para 'active'
UPDATE volunteers SET status = 'active' WHERE status = 'pending';

-- Opcional: Garante que os adms e líderes sempre sejam ativos
UPDATE volunteers SET status = 'active' WHERE role IN ('admin', 'lider');
