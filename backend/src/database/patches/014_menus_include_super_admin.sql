-- Inclui super_admin em menus que já liberam admin (mesmo acesso à área administrativa)
UPDATE menus
SET roles = array_append(roles, 'super_admin')
WHERE 'admin' = ANY(roles)
  AND NOT ('super_admin' = ANY(roles));
