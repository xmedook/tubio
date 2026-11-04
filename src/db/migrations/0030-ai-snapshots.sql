-- Varita (agente): foto de la página antes de aplicar cambios de estructura, para poder deshacerlos de golpe.
CREATE TABLE ai_snapshots (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  link_id     INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  data        TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX ai_snapshots_link ON ai_snapshots(link_id, created_at);
