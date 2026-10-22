-- F2b: píxeles reutilizables, páginas splash, segmentación de destino y ocultar destino
CREATE TABLE pixels (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('meta', 'ga4', 'tiktok', 'linkedin', 'pinterest', 'x', 'snapchat', 'quora')),
  name        TEXT    NOT NULL,
  pixel_id    TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX pixels_user ON pixels(user_id);

CREATE TABLE splashes (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  data        TEXT    NOT NULL DEFAULT '{}',
  created_at  INTEGER NOT NULL
);
CREATE INDEX splashes_user ON splashes(user_id);

ALTER TABLE links ADD COLUMN pixel_ids TEXT NOT NULL DEFAULT '[]';
ALTER TABLE links ADD COLUMN splash_id INTEGER REFERENCES splashes(id) ON DELETE SET NULL;
ALTER TABLE links ADD COLUMN targeting TEXT NOT NULL DEFAULT '{}';
ALTER TABLE links ADD COLUMN cloak INTEGER NOT NULL DEFAULT 0;
ALTER TABLE stat_events ADD COLUMN variant TEXT;
