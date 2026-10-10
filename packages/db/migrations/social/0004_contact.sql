-- S13 step 10 (D34, App Review 1.2: published contact): what people send through /contact. An address only when the
-- sender was signed in (their deletion and export include it); an email only when they asked for a reply.
CREATE TABLE IF NOT EXISTS contact_messages (
  id          BIGSERIAL   PRIMARY KEY,
  topic       TEXT        NOT NULL CHECK (topic IN ('problem', 'report', 'privacy', 'question')),
  body        TEXT        NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  email       TEXT        CHECK (email IS NULL OR (length(email) <= 200 AND email LIKE '%_@_%')),
  address     TEXT        CHECK (address IS NULL OR address ~ '^0x[0-9a-f]{40}$'),
  status      TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS contact_messages_open_idx ON contact_messages (created_at) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS contact_messages_address_idx ON contact_messages (address) WHERE address IS NOT NULL;
