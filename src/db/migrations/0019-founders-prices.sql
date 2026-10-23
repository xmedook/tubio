-- Fundadores: las primeras 100 cuentas con correo confirmado reciben un año del plan más alto.
ALTER TABLE users ADD COLUMN founder_no INTEGER;
CREATE UNIQUE INDEX users_founder_no ON users(founder_no) WHERE founder_no IS NOT NULL;
-- Precios de lanzamiento (centavos MXN, IVA incluido): anual = 10 meses
UPDATE plans SET price_month = 9900, price_year = 99000 WHERE slug = 'pro';
UPDATE plans SET price_month = 29900, price_year = 299000 WHERE slug = 'business';
