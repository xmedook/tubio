-- Datos que recogen los bloques de captura (correo, teléfono, contacto, suscripción, encuesta)
CREATE TABLE collected (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id     INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  block_id    INTEGER REFERENCES bio_blocks(id) ON DELETE SET NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('email', 'phone', 'contact', 'subscribe', 'poll')),
  data        TEXT    NOT NULL DEFAULT '{}',
  visitor     TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
CREATE INDEX collected_user ON collected(user_id, created_at);
CREATE INDEX collected_block ON collected(block_id, kind);

-- A dónde avisar cuando llega algo
CREATE TABLE notify_targets (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('email', 'webhook', 'slack', 'discord', 'telegram')),
  name        TEXT    NOT NULL,
  config      TEXT    NOT NULL DEFAULT '{}',
  is_enabled  INTEGER NOT NULL DEFAULT 1,
  last_ok_at  INTEGER,
  last_error  TEXT,
  created_at  INTEGER NOT NULL
);
CREATE INDEX notify_targets_user ON notify_targets(user_id);

-- Cola de trabajos con reintentos (entregas de avisos)
CREATE TABLE jobs (
  id          INTEGER PRIMARY KEY,
  kind        TEXT    NOT NULL,
  payload     TEXT    NOT NULL DEFAULT '{}',
  run_at      INTEGER NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  done_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX jobs_due ON jobs(done_at, run_at);
