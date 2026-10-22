-- Reportes de abuso de visitantes (phishing, spam, contenido ilegal…)
CREATE TABLE abuse_reports (
  id            INTEGER PRIMARY KEY,
  link_id       INTEGER REFERENCES links(id) ON DELETE CASCADE,
  alias         TEXT    NOT NULL,
  reason        TEXT    NOT NULL,
  details       TEXT    NOT NULL DEFAULT '',
  reporter_email TEXT   NOT NULL DEFAULT '',
  status        TEXT    NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at    INTEGER NOT NULL,
  resolved_at   INTEGER,
  resolved_by   INTEGER
);
CREATE INDEX abuse_reports_status ON abuse_reports(status, created_at);
