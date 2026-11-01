-- Marca: «túbio» (con acento) en todo texto visible (regla de Alejandro, 1-nov-2026). El nombre del sitio guardado por el admin pasa de «tubio» a «túbio»
-- sólo si seguía siendo el valor por defecto; un nombre que la persona cambió a mano no se toca.
UPDATE settings SET value = '"túbio"' WHERE key = 'site_name' AND value = '"tubio"';
