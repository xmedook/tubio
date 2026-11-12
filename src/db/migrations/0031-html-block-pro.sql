-- TEMPORAL (Alejandro, peer #2386, 11-nov-2026): el plan Pro puede usar el bloque HTML propio «hasta nuevo aviso».
-- Solo el bloque html; iframes, sitios de código propio y precios siguen igual.
-- Revertir sin deploy: UPDATE plans SET limits = json_set(limits, '$.html_block', json('false')) WHERE slug = 'pro';
UPDATE plans SET limits = json_set(limits, '$.html_block', json('true')) WHERE slug = 'pro';
