-- Un dominio pendiente ya no aparta el host para nadie: varias cuentas pueden intentarlo
-- y sólo la que publique su TXT lo activa. Único sólo entre activos (y por cuenta).
CREATE TABLE domains_new (
  id              INTEGER PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  host            TEXT    NOT NULL,
  status          TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'disabled')),
  verify_token    TEXT    NOT NULL,
  verified_at     INTEGER,
  home_link_id    INTEGER REFERENCES links(id) ON DELETE SET NULL,
  created_at      INTEGER NOT NULL
);
INSERT INTO domains_new SELECT id, user_id, host, status, verify_token, verified_at, home_link_id, created_at FROM domains;
DROP TABLE domains;
ALTER TABLE domains_new RENAME TO domains;
CREATE INDEX domains_user ON domains(user_id);
CREATE UNIQUE INDEX domains_user_host ON domains(user_id, host);
CREATE UNIQUE INDEX domains_active_host ON domains(host) WHERE status = 'active';
