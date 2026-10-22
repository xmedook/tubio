-- Equipos (F2c): el dueño invita personas a su espacio de trabajo con un rol
CREATE TABLE team_members (
  id            INTEGER PRIMARY KEY,
  owner_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
  email         TEXT    NOT NULL,
  role          TEXT    NOT NULL DEFAULT 'editor' CHECK (role IN ('viewer', 'editor', 'admin')),
  token_hash    TEXT    NOT NULL UNIQUE,
  invited_at    INTEGER NOT NULL,
  accepted_at   INTEGER,
  UNIQUE (owner_id, email)
);
CREATE INDEX team_members_user ON team_members(user_id);

ALTER TABLE sessions ADD COLUMN workspace_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
