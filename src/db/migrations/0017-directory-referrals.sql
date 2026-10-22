-- F4: directorio (el dueño lo activa en Diseño; el admin puede ocultar) y afiliados
ALTER TABLE links ADD COLUMN dir_hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN ref_code TEXT;
ALTER TABLE users ADD COLUMN referred_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX users_ref_code ON users(ref_code) WHERE ref_code IS NOT NULL;

CREATE TABLE referral_earnings (
  id            INTEGER PRIMARY KEY,
  affiliate_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referred_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  payment_id    INTEGER NOT NULL UNIQUE REFERENCES payments(id) ON DELETE CASCADE,
  amount        INTEGER NOT NULL,
  currency      TEXT    NOT NULL DEFAULT 'MXN',
  status        TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'void')),
  created_at    INTEGER NOT NULL,
  paid_at       INTEGER
);
CREATE INDEX referral_earnings_aff ON referral_earnings(affiliate_id, status);
