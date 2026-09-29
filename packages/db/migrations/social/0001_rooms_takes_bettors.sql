-- Ported from Masayume 68f7a09:packages/db/src/schema.ts (inline SQL constants → an ordered migration, D-031).
CREATE TABLE IF NOT EXISTS bettors (
  chain_id     INTEGER     NOT NULL,
  market_id    TEXT        NOT NULL,
  -- Lowercased 0x address, taken from the receipt the server read.
  wallet       TEXT        NOT NULL,
  -- The fill that earned the seat; the first one, kept.
  tx_hash      TEXT        NOT NULL,
  route        TEXT        NOT NULL CHECK (route IN ('wallet', 'vault', 'leverage', 'private')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chain_id, market_id, wallet)
);

CREATE TABLE IF NOT EXISTS room_comments (
  id           BIGSERIAL PRIMARY KEY,
  -- The market this Room is about. Rooms are per-Window, as the reference's are: a
  -- comment about a 5m round is not a comment about the next one.
  market_id    TEXT        NOT NULL,
  -- Lowercased 0x address, verified from a signature before insert.
  author       TEXT        NOT NULL,
  body         TEXT        NOT NULL CHECK (length(body) BETWEEN 1 AND 280),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only read the Room makes: newest comments for one market.
CREATE INDEX IF NOT EXISTS room_comments_market_idx
  ON room_comments (market_id, created_at DESC);

CREATE TABLE IF NOT EXISTS takes (
  id            BIGSERIAL PRIMARY KEY,
  market_id     TEXT        NOT NULL,
  -- Lowercased 0x address, verified from the signature before insert.
  author        TEXT        NOT NULL,
  side          TEXT        NOT NULL CHECK (side IN ('up', 'down')),
  caption       TEXT        NOT NULL CHECK (length(caption) <= 240),
  asset         TEXT        NOT NULL,
  interval_sec  INTEGER     NOT NULL,
  expiry_sec    INTEGER     NOT NULL,
  -- The opening print on the oracle's scale, as a decimal string; null when the
  -- call was posted before the print landed.
  line_raw      TEXT,
  -- Held a position on this Window at post time — a chain read the route makes,
  -- never a claim the client gets to assert.
  backed        BOOLEAN     NOT NULL,
  signature     TEXT        NOT NULL,
  issued_at_ms  BIGINT      NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The only read the reel makes: the newest takes, venue-wide.
CREATE INDEX IF NOT EXISTS takes_created_idx
  ON takes (created_at DESC);
