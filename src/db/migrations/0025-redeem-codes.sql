-- Códigos de canje: N días de un plan, sin pago (promociones, regalos, soporte)
CREATE TABLE redeem_codes (
  code        TEXT    PRIMARY KEY,
  plan_id     INTEGER NOT NULL REFERENCES plans(id),
  days        INTEGER NOT NULL CHECK (days BETWEEN 1 AND 3650),
  max_uses    INTEGER,
  used        INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,
  note        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL
);
CREATE TABLE redemptions (
  code        TEXT    NOT NULL REFERENCES redeem_codes(code) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (code, user_id)
);
