-- Llaves de API por usuario (sólo se guarda el hash)
CREATE TABLE api_keys (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL,
  prefix        TEXT    NOT NULL UNIQUE,
  key_hash      TEXT    NOT NULL,
  last_used_at  INTEGER,
  created_at    INTEGER NOT NULL
);
CREATE INDEX api_keys_user ON api_keys(user_id);
