-- Minisitios: un enlace bio pasa a ser un SITIO con páginas y secciones.
-- Sin filas aquí, la página bio funciona igual que siempre (un sitio de 1 página con 1 sección angosta);
-- las filas se crean la primera vez que alguien abre «Sitio» en el panel (ver minisitio/repo.ts ensureSite).

-- ajustes del sitio: cabecera, barra de acción inferior, pie (JSON validado por minisitio/schema.ts)
CREATE TABLE ms_sites (
  link_id          INTEGER PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  data             TEXT    NOT NULL DEFAULT '{}',
  updated_at       INTEGER NOT NULL
);

-- slug '' = página de inicio (/<alias>); otro slug = /<alias>/<slug>
CREATE TABLE ms_pages (
  id               INTEGER PRIMARY KEY,
  link_id          INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  slug             TEXT    NOT NULL,
  title            TEXT    NOT NULL DEFAULT '',
  position         INTEGER NOT NULL DEFAULT 0,
  is_enabled       INTEGER NOT NULL DEFAULT 1,
  data             TEXT    NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (link_id, slug)
);
CREATE INDEX ms_pages_link ON ms_pages(link_id, position);

CREATE TABLE ms_sections (
  id               INTEGER PRIMARY KEY,
  page_id          INTEGER NOT NULL REFERENCES ms_pages(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL DEFAULT 0,
  is_enabled       INTEGER NOT NULL DEFAULT 1,
  data             TEXT    NOT NULL DEFAULT '{}',
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX ms_sections_page ON ms_sections(page_id, position);

-- bloque → sección. NULL = bloque suelto: vive en la primera sección de la página de inicio.
ALTER TABLE bio_blocks ADD COLUMN section_id INTEGER REFERENCES ms_sections(id) ON DELETE CASCADE;
CREATE INDEX bio_blocks_section ON bio_blocks(section_id, position);
