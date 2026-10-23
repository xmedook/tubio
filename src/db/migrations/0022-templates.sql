-- Plantillas de página bio: copia del diseño y los bloques (no depende de la página de origen).
-- user_id NULL = plantilla general (la crea el admin); con user_id = plantilla privada de esa cuenta.
CREATE TABLE templates (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  slug        TEXT    UNIQUE,
  name        TEXT    NOT NULL,
  category    TEXT    NOT NULL DEFAULT '',
  design      TEXT    NOT NULL DEFAULT '{}',
  blocks      TEXT    NOT NULL DEFAULT '[]',
  uses        INTEGER NOT NULL DEFAULT 0,
  sort        INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);
CREATE INDEX templates_user ON templates(user_id);
