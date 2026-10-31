-- Solicitudes por WhatsApp (bloque wa_request): se guardan como dato capturado (collected.kind = 'whatsapp') y se miden
-- aperturas de la hoja, envíos y abandonos por día.

-- SQLite no permite cambiar un CHECK: se reconstruye collected con el tipo nuevo
CREATE TABLE collected_new (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id     INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  block_id    INTEGER REFERENCES bio_blocks(id) ON DELETE SET NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('email', 'phone', 'contact', 'subscribe', 'poll', 'whatsapp')),
  data        TEXT    NOT NULL DEFAULT '{}',
  visitor     TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  read_at     INTEGER
);
INSERT INTO collected_new (id, user_id, link_id, block_id, kind, data, visitor, created_at, read_at)
  SELECT id, user_id, link_id, block_id, kind, data, visitor, created_at, read_at FROM collected;
DROP TABLE collected;
ALTER TABLE collected_new RENAME TO collected;
CREATE INDEX collected_user ON collected(user_id, created_at);
CREATE INDEX collected_block ON collected(block_id, kind);

CREATE TABLE wa_stats (
  block_id    INTEGER NOT NULL REFERENCES bio_blocks(id) ON DELETE CASCADE,
  day         TEXT    NOT NULL,
  opens       INTEGER NOT NULL DEFAULT 0,
  sends       INTEGER NOT NULL DEFAULT 0,
  abandons    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (block_id, day)
);
