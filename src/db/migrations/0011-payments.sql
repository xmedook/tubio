-- Pagos de planes (transferencia con comprobante; Stripe y Mercado Pago después)
CREATE TABLE payments (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       INTEGER NOT NULL REFERENCES plans(id),
  period        TEXT    NOT NULL CHECK (period IN ('month', 'year', 'lifetime')),
  amount        INTEGER NOT NULL,
  discount      INTEGER NOT NULL DEFAULT 0,
  currency      TEXT    NOT NULL DEFAULT 'MXN',
  method        TEXT    NOT NULL CHECK (method IN ('transfer', 'stripe', 'mercadopago', 'manual')),
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected', 'refunded', 'cancelled')),
  reference     TEXT    NOT NULL UNIQUE,
  coupon_code   TEXT,
  proof_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  provider_ref  TEXT,
  billing_name  TEXT    NOT NULL DEFAULT '',
  notes         TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  paid_at       INTEGER,
  reviewed_by   INTEGER
);
CREATE INDEX payments_user ON payments(user_id, created_at);
CREATE INDEX payments_status ON payments(status, created_at);

CREATE TABLE coupons (
  code          TEXT    PRIMARY KEY,
  percent_off   INTEGER NOT NULL DEFAULT 0 CHECK (percent_off BETWEEN 0 AND 100),
  max_uses      INTEGER,
  used          INTEGER NOT NULL DEFAULT 0,
  expires_at    INTEGER,
  plans         TEXT    NOT NULL DEFAULT '[]',
  created_at    INTEGER NOT NULL
);

ALTER TABLE users ADD COLUMN trial_used_at INTEGER;
