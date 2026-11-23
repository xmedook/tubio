-- Acceso sin contraseña (liga por correo, 23-nov-2026, peer #5608): auth_tokens admite el tipo 'magic_login'.
-- SQLite no cambia un CHECK: se recrea la tabla y se copian las filas.
CREATE TABLE auth_tokens_new (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT    NOT NULL CHECK (kind IN ('verify_email', 'reset_password', 'magic_login')),
  token_hash       TEXT    NOT NULL UNIQUE,
  expires_at       INTEGER NOT NULL,
  used_at          INTEGER,
  created_at       INTEGER NOT NULL
);
INSERT INTO auth_tokens_new (id, user_id, kind, token_hash, expires_at, used_at, created_at)
  SELECT id, user_id, kind, token_hash, expires_at, used_at, created_at FROM auth_tokens;
DROP TABLE auth_tokens;
ALTER TABLE auth_tokens_new RENAME TO auth_tokens;
