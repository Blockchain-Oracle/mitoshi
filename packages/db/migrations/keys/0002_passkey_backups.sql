-- S13 step 10 (D-053): backup passkeys — a second WebAuthn key the account authorised as a TIP-1049 admin key. The row
-- maps the backup's credential to its account, so signing in with it signs in as the account (the chain's
-- `isAdminKey(account, keyId)` is checked again at every sign-in; a revoked backup stops working).
CREATE TABLE IF NOT EXISTS passkey_backups (
  credential_id TEXT        PRIMARY KEY,
  key_id        TEXT        NOT NULL CHECK (key_id ~ '^0x[0-9a-f]{40}$'),
  public_key    TEXT        NOT NULL,
  account       TEXT        NOT NULL CHECK (account ~ '^0x[0-9a-f]{40}$'),
  name          TEXT        CHECK (name IS NULL OR length(name) <= 40),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS passkey_backups_key_idx ON passkey_backups (key_id);
CREATE INDEX IF NOT EXISTS passkey_backups_account_idx ON passkey_backups (account);
