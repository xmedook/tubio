-- Campanita: avisos dentro de tubio (formularios, pagos, comisiones, plan por vencer)
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,
  title       TEXT    NOT NULL,
  body        TEXT    NOT NULL DEFAULT '',
  url         TEXT    NOT NULL DEFAULT '',
  read_at     INTEGER,
  created_at  INTEGER NOT NULL
);
CREATE INDEX notifications_user ON notifications(user_id, read_at, created_at);
