-- Admin Escalas (global): sem vínculo com igreja filial
UPDATE volunteers
SET role = 'super_admin', church_id = NULL
WHERE email = 'admin@escalas.com';

UPDATE volunteers
SET church_id = NULL
WHERE role = 'super_admin' AND church_id IS NOT NULL;
