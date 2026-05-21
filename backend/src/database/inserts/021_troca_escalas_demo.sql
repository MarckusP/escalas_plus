-- Par de teste para troca de escalas: lider@escalas.com (solicitante) + voluntario@escalas.com (alvo)
-- Critérios: mesma igreja, ministério Louvor, função Vocal, escala confirmada, evento >12h, sem indisponibilidade

UPDATE events
SET
  event_date = (CURRENT_DATE + INTERVAL '14 days')::date,
  event_time = COALESCE(event_time, '19:00:00'::time)
WHERE name = 'Culto Dominical (Demo)';

INSERT INTO volunteer_roles (volunteer_id, role_id)
SELECT v.id, r.id
FROM volunteers v
JOIN roles r ON r.name = 'Vocal'
JOIN departments d ON d.id = r.department_id AND d.church_id = v.church_id AND d.name = 'Louvor'
WHERE v.email IN ('lider@escalas.com', 'voluntario@escalas.com')
ON CONFLICT (volunteer_id, role_id) DO NOTHING;

INSERT INTO volunteers_departments (volunteer_id, department_id, is_leader)
SELECT v.id, d.id, (v.email = 'lider@escalas.com')
FROM volunteers v
JOIN departments d ON d.church_id = v.church_id AND d.name = 'Louvor'
WHERE v.email IN ('lider@escalas.com', 'voluntario@escalas.com')
ON CONFLICT (volunteer_id, department_id) DO UPDATE SET is_leader = EXCLUDED.is_leader;

INSERT INTO availability (volunteer_id, day_of_week, period, available)
SELECT v.id, EXTRACT(DOW FROM e.event_date)::int, p.period, true
FROM volunteers v
JOIN events e ON e.name = 'Culto Dominical (Demo)' AND e.church_id = v.church_id
CROSS JOIN (VALUES ('manha'), ('tarde'), ('noite')) AS p(period)
WHERE v.email IN ('lider@escalas.com', 'voluntario@escalas.com')
ON CONFLICT (volunteer_id, day_of_week, period) DO UPDATE SET available = true;

DELETE FROM unavailability u
USING volunteers v, events e
WHERE u.volunteer_id = v.id
  AND v.email IN ('lider@escalas.com', 'voluntario@escalas.com')
  AND e.name = 'Culto Dominical (Demo)'
  AND e.church_id = v.church_id
  AND u.exception_date = e.event_date;

INSERT INTO schedule (event_id, volunteer_id, role_id, status)
SELECT e.id, v.id, r.id, 'confirmado'
FROM events e
JOIN volunteers v ON v.email = 'lider@escalas.com' AND v.church_id = e.church_id
JOIN roles r ON r.name = 'Vocal'
JOIN departments d ON d.id = r.department_id AND d.church_id = e.church_id AND d.name = 'Louvor'
WHERE e.name = 'Culto Dominical (Demo)'
ON CONFLICT (event_id, volunteer_id, role_id) DO UPDATE SET status = 'confirmado';
