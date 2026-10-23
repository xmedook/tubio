-- Google Tag Manager como tipo de píxel (la CHECK de kind sólo se cambia rehaciendo la tabla)
CREATE TABLE pixels_new (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL CHECK (kind IN ('meta', 'ga4', 'gtm', 'tiktok', 'linkedin', 'pinterest', 'x', 'snapchat', 'quora')),
  name        TEXT    NOT NULL,
  pixel_id    TEXT    NOT NULL,
  created_at  INTEGER NOT NULL
);
INSERT INTO pixels_new SELECT id, user_id, kind, name, pixel_id, created_at FROM pixels;
DROP TABLE pixels;
ALTER TABLE pixels_new RENAME TO pixels;
CREATE INDEX pixels_user ON pixels(user_id);
