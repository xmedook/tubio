-- hits: toda entrega (bots incluidos) para el tope de clics; clicks sigue siendo sólo humanos (estadísticas)
ALTER TABLE links ADD COLUMN hits INTEGER NOT NULL DEFAULT 0;
UPDATE links SET hits = clicks;
-- 2FA: bloqueo por cuenta y contra reuso de códigos
ALTER TABLE users ADD COLUMN failed_2fa INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until INTEGER;
ALTER TABLE users ADD COLUMN totp_last_counter INTEGER;
