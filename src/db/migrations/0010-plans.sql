-- Planes (F3). Precios en centavos MXN (IVA incluido). limits/features en JSON.
CREATE TABLE plans (
  id              INTEGER PRIMARY KEY,
  slug            TEXT    NOT NULL UNIQUE,
  name            TEXT    NOT NULL,
  price_month     INTEGER,
  price_year      INTEGER,
  price_lifetime  INTEGER,
  currency        TEXT    NOT NULL DEFAULT 'MXN',
  trial_days      INTEGER NOT NULL DEFAULT 0,
  limits          TEXT    NOT NULL DEFAULT '{}',
  is_public       INTEGER NOT NULL DEFAULT 1,
  sort            INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN plan_id INTEGER REFERENCES plans(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN plan_expires_at INTEGER;

-- -1 = ilimitado
INSERT INTO plans (slug, name, price_month, price_year, price_lifetime, trial_days, limits, sort, created_at) VALUES
('free', 'Gratis', NULL, NULL, NULL, 0,
 '{"bio_pages":1,"links":25,"blocks_per_page":30,"qr":10,"stats_days":30,"storage_mb":50,"remove_branding":false,"marketing":false,"custom_domains":0,"capture_targets":["email"],"custom_code":false,"team_members":0,"api":false}', 0, 0),
('pro', 'Pro', 7900, 79000, NULL, 14,
 '{"bio_pages":10,"links":1000,"blocks_per_page":100,"qr":200,"stats_days":365,"storage_mb":1024,"remove_branding":true,"marketing":true,"custom_domains":1,"capture_targets":["email","webhook","slack","discord","telegram"],"custom_code":false,"team_members":0,"api":false}', 1, 0),
('business', 'Negocio', 24900, 249000, NULL, 14,
 '{"bio_pages":-1,"links":-1,"blocks_per_page":100,"qr":-1,"stats_days":1095,"storage_mb":10240,"remove_branding":true,"marketing":true,"custom_domains":10,"capture_targets":["email","webhook","slack","discord","telegram"],"custom_code":true,"team_members":5,"api":true}', 2, 0);
