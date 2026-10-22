-- F4: páginas del sitio y blog (editables desde admin)
CREATE TABLE site_pages (
  id            INTEGER PRIMARY KEY,
  kind          TEXT    NOT NULL CHECK (kind IN ('page', 'post')),
  slug          TEXT    NOT NULL,
  locale        TEXT    NOT NULL DEFAULT 'es-MX',
  title         TEXT    NOT NULL,
  summary       TEXT    NOT NULL DEFAULT '',
  body          TEXT    NOT NULL DEFAULT '',
  in_footer     INTEGER NOT NULL DEFAULT 0,
  published_at  INTEGER,
  author_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  UNIQUE (kind, slug, locale)
);
