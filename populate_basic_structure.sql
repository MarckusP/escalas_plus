-- SCRIPT DE POPULAÇÃO BÁSICA (DBeaver)
-- Certifique-se de que a tabela 'volunteers' já possui o super_admin inicial se desejar mantê-lo.

DO $$
DECLARE
    new_church_id INT;
    new_dept_id INT;
    new_role_id INT;
    vocal_vol_id INT;
    lider_vol_id INT;
BEGIN
    -- 1. Inserir Igreja
    INSERT INTO churches (name, address, status, created_at)
    VALUES ('Igreja Matriz', 'Rua Principal, 123', 'active', NOW())
    RETURNING id INTO new_church_id;

    -- 2. Inserir Departamento de Louvor
    INSERT INTO departments (name, church_id, description, created_at)
    VALUES ('Louvor', new_church_id, 'Departamento de música e adoração', NOW())
    RETURNING id INTO new_dept_id;

    -- 3. Inserir Função Vocal
    INSERT INTO roles (name, department_id, description)
    VALUES ('Vocal', new_dept_id, 'Cantores e backing vocals')
    RETURNING id INTO new_role_id;

    -- 4. Inserir Voluntário Vocal
    INSERT INTO volunteers (name, email, password, role, church_id, status, created_at)
    VALUES ('João Cantor', 'joao.vocal@email.com', '$2b$10$YourHashedPasswordHere', 'voluntario', new_church_id, 'active', NOW())
    RETURNING id INTO vocal_vol_id;

    -- Vincular Voluntário à Função Vocal
    INSERT INTO volunteer_roles (volunteer_id, role_id)
    VALUES (vocal_vol_id, new_role_id);

    -- Vincular Voluntário ao Departamento
    INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
    VALUES (vocal_vol_id, new_dept_id, false);

    -- 5. Inserir Líder
    INSERT INTO volunteers (name, email, password, role, church_id, status, created_at)
    VALUES ('Maria Líder', 'maria.lider@email.com', '$2b$10$YourHashedPasswordHere', 'lider', new_church_id, 'active', NOW())
    RETURNING id INTO lider_vol_id;

    -- Vincular Líder ao Departamento como Líder
    INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
    VALUES (lider_vol_id, new_dept_id, true);

    RAISE NOTICE 'Igreja ID: %, Dept ID: %, Role ID: %, Voluntário ID: %, Líder ID: %', 
                 new_church_id, new_dept_id, new_role_id, vocal_vol_id, lider_vol_id;
END $$;
