-- tubio — esquema inicial (F1). Fechas: epoch ms UTC. JSON en TEXT.

CREATE TABLE users (
  id               INTEGER PRIMARY KEY,
  email            TEXT    NOT NULL UNIQUE,
  password_hash    TEXT    NOT NULL,
  name             TEXT    NOT NULL DEFAULT '',
  locale           TEXT    NOT NULL DEFAULT 'es-MX',
  timezone         TEXT    NOT NULL DEFAULT 'America/Mexico_City',
  role             TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  status           TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  email_verified_at INTEGER,
  totp_secret      TEXT,
  totp_enabled_at  INTEGER,
  is_verified      INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);

CREATE TABLE sessions (
  id_hash          TEXT    PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf             TEXT    NOT NULL,
  pending_2fa      INTEGER NOT NULL DEFAULT 0,
  impersonator_id  INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at       INTEGER NOT NULL,
  expires_at       INTEGER NOT NULL,
  last_seen_at     INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);

CREATE TABLE auth_tokens (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind             TEXT    NOT NULL CHECK (kind IN ('verify_email', 'reset_password')),
  token_hash       TEXT    NOT NULL UNIQUE,
  expires_at       INTEGER NOT NULL,
  used_at          INTEGER,
  created_at       INTEGER NOT NULL
);

CREATE TABLE projects (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT    NOT NULL,
  color            TEXT    NOT NULL DEFAULT '#4f46e5',
  created_at       INTEGER NOT NULL
);
CREATE INDEX projects_user ON projects(user_id);

CREATE TABLE files (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key              TEXT    NOT NULL UNIQUE,
  kind             TEXT    NOT NULL CHECK (kind IN ('image', 'file')),
  original_name    TEXT    NOT NULL DEFAULT '',
  mime             TEXT    NOT NULL,
  size             INTEGER NOT NULL,
  sha256           TEXT    NOT NULL,
  created_at       INTEGER NOT NULL
);
CREATE INDEX files_user ON files(user_id);

-- domain_id = 0 es el dominio principal; F2 añade la tabla domains (id >= 1).
CREATE TABLE links (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  domain_id        INTEGER NOT NULL DEFAULT 0,
  alias            TEXT    NOT NULL,
  kind             TEXT    NOT NULL CHECK (kind IN ('bio', 'short', 'file', 'vcard', 'event')),
  title            TEXT    NOT NULL DEFAULT '',
  target_url       TEXT,
  redirect_code    INTEGER NOT NULL DEFAULT 302 CHECK (redirect_code IN (301, 302, 307, 308)),
  data             TEXT    NOT NULL DEFAULT '{}',
  is_enabled       INTEGER NOT NULL DEFAULT 1,
  starts_at        INTEGER,
  ends_at          INTEGER,
  expired_url      TEXT,
  click_limit      INTEGER,
  limit_url        TEXT,
  password_hash    TEXT,
  is_sensitive     INTEGER NOT NULL DEFAULT 0,
  utm              TEXT    NOT NULL DEFAULT '{}',
  forward_query    INTEGER NOT NULL DEFAULT 0,
  clicks           INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  UNIQUE (domain_id, alias)
);
CREATE INDEX links_user ON links(user_id, created_at);

CREATE TABLE bio_blocks (
  id               INTEGER PRIMARY KEY,
  link_id          INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  type             TEXT    NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0,
  is_enabled       INTEGER NOT NULL DEFAULT 1,
  starts_at        INTEGER,
  ends_at          INTEGER,
  data             TEXT    NOT NULL DEFAULT '{}',
  style            TEXT    NOT NULL DEFAULT '{}',
  clicks           INTEGER NOT NULL DEFAULT 0,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX bio_blocks_link ON bio_blocks(link_id, position);

CREATE TABLE qr_codes (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  name             TEXT    NOT NULL,
  kind             TEXT    NOT NULL,
  data             TEXT    NOT NULL DEFAULT '{}',
  style            TEXT    NOT NULL DEFAULT '{}',
  logo_file_id     INTEGER REFERENCES files(id) ON DELETE SET NULL,
  link_id          INTEGER REFERENCES links(id) ON DELETE SET NULL,
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX qr_codes_user ON qr_codes(user_id, created_at);

CREATE TABLE stat_events (
  id               INTEGER PRIMARY KEY,
  link_id          INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
  block_id         INTEGER REFERENCES bio_blocks(id) ON DELETE CASCADE,
  kind             TEXT    NOT NULL CHECK (kind IN ('view', 'click')),
  ts               INTEGER NOT NULL,
  day              TEXT    NOT NULL,
  hour             INTEGER NOT NULL,
  visitor          TEXT    NOT NULL,
  country          TEXT,
  city             TEXT,
  device           TEXT,
  os               TEXT,
  browser          TEXT,
  lang             TEXT,
  referrer         TEXT,
  utm_source       TEXT,
  utm_medium       TEXT,
  utm_campaign     TEXT
);
CREATE INDEX stat_events_link ON stat_events(link_id, ts);
CREATE INDEX stat_events_block ON stat_events(block_id, ts);
CREATE INDEX stat_events_ts ON stat_events(ts);

CREATE TABLE stat_salts (
  day              TEXT    PRIMARY KEY,
  salt             TEXT    NOT NULL
);

CREATE TABLE blocked_hosts (
  host             TEXT    PRIMARY KEY,
  reason           TEXT    NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL
);

CREATE TABLE settings (
  key              TEXT    PRIMARY KEY,
  value            TEXT    NOT NULL
);

CREATE TABLE audit_log (
  id               INTEGER PRIMARY KEY,
  actor_id         INTEGER,
  user_id          INTEGER,
  action           TEXT    NOT NULL,
  target           TEXT    NOT NULL DEFAULT '',
  meta             TEXT    NOT NULL DEFAULT '{}',
  ts               INTEGER NOT NULL
);
CREATE INDEX audit_log_ts ON audit_log(ts);
