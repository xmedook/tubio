-- Caché de datos externos de bloques (RSS, YouTube, clima)
CREATE TABLE remote_cache (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  fetched_at INTEGER NOT NULL,
  error      TEXT
);
