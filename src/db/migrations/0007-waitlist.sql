-- Lista de espera mientras el registro está cerrado
CREATE TABLE waitlist (
  email      TEXT    PRIMARY KEY,
  locale     TEXT    NOT NULL DEFAULT 'es-MX',
  created_at INTEGER NOT NULL,
  invited_at INTEGER
);
