-- Dominios propios (F2c). links.domain_id ya existía (0 = dominio principal).
CREATE TABLE domains (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host            TEXT    NOT NULL UNIQUE,
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  verify_token    TEXT    NOT NULL,
  verified_at     INTEGER,
  home_link_id    INTEGER REFERENCES links(id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL
);
CREATE INDEX domains_user ON domains(user_id);
