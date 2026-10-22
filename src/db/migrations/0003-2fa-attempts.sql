-- Intentos fallidos de 2FA en una sesión pendiente: al quinto se cierra
ALTER TABLE sessions ADD COLUMN failed_2fa INTEGER NOT NULL DEFAULT 0;
