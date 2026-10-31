-- «Lo armamos por ti»: solicitudes de alta asistida desde la portada (cola interna para el equipo de tubio).
-- El correo y el WhatsApp son datos de contacto de quien pide; nunca se muestran públicamente.
CREATE TABLE assisted_requests (
  id          INTEGER PRIMARY KEY,
  giro        TEXT NOT NULL DEFAULT '',
  business    TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT '',
  whatsapp    TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  city        TEXT NOT NULL DEFAULT '',
  offer       TEXT NOT NULL DEFAULT '',
  links       TEXT NOT NULL DEFAULT '',
  locale      TEXT NOT NULL DEFAULT 'es-MX',
  status      TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'doing', 'done')),
  note        TEXT NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_assisted_status ON assisted_requests (status, created_at);
