INSERT INTO churches (name, address)
SELECT 'Igreja Filial', 'Av. Secundária, 200'
WHERE NOT EXISTS (SELECT 1 FROM churches WHERE name = 'Igreja Filial');
