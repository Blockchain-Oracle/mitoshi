-- Ported from Masayume 68f7a09:packages/db/src/schema-strategies.ts (inline SQL constants → an ordered migration, D-031).
CREATE TABLE IF NOT EXISTS runner_heartbeats (
  id            BIGSERIAL PRIMARY KEY,
  -- Lowercased runner key.
  runner        TEXT        NOT NULL,
  strategy_id   TEXT        NOT NULL,
  tick_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  interval_ms   INTEGER     NOT NULL,
  -- The cycle in the runner's own words: "scanned 6 markets, closest trigger 8 bps away".
  why           TEXT        NOT NULL,
  scanned       INTEGER     NOT NULL DEFAULT 0,
  closest_bps   INTEGER,
  dry_run       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS runner_heartbeats_strategy_idx
  ON runner_heartbeats (strategy_id, tick_at DESC);

CREATE TABLE IF NOT EXISTS strategy_fills (
  tx_hash       TEXT        PRIMARY KEY,
  strategy_id   TEXT        NOT NULL,
  grant_id      TEXT        NOT NULL,
  -- Lowercased subscriber address: the position's owner, by construction.
  owner         TEXT        NOT NULL,
  market_id     TEXT        NOT NULL,
  side          TEXT        NOT NULL CHECK (side IN ('up', 'down')),
  -- Base units as decimal strings, never floats.
  cash_delta    TEXT        NOT NULL,
  token_delta   TEXT        NOT NULL,
  at_sec        BIGINT      NOT NULL,
  dry_run       BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS strategy_fills_strategy_idx
  ON strategy_fills (strategy_id, at_sec DESC);

CREATE TABLE IF NOT EXISTS strategy_playbooks (
  strategy_id   TEXT        PRIMARY KEY,
  -- Lowercased creator address that wrote it, verified from a signature before upsert.
  creator       TEXT        NOT NULL,
  body          TEXT        NOT NULL CHECK (length(body) <= 4000),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An agent strategy's memory: one row per Window it read — what the model said, what the gate ruled,
-- what the runner then sent. The model actually used is recorded here, never in the on-chain spec.
CREATE TABLE IF NOT EXISTS strategy_decisions (
  id            BIGSERIAL PRIMARY KEY,
  strategy_id   TEXT        NOT NULL,
  -- Lowercased bytes32 market id; with strategy_id, the one read per Window.
  market_id     TEXT        NOT NULL,
  -- Lowercased runner key.
  runner        TEXT        NOT NULL,
  decided_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- provider/model as the provider reported it, e.g. anthropic/claude-opus-5-20260101.
  model         TEXT        NOT NULL,
  -- sha256 of the exact prompt bytes the model saw.
  prompt_hash   TEXT        NOT NULL,
  verdict_side  TEXT        NOT NULL CHECK (verdict_side IN ('up', 'down', 'hold', 'none')),
  confidence    REAL,
  why           TEXT        NOT NULL,
  gate          TEXT        NOT NULL CHECK (gate IN ('trade', 'held', 'failed')),
  gate_reason   TEXT        NOT NULL,
  side          TEXT        CHECK (side IN ('up', 'down')),
  filled        INTEGER     NOT NULL DEFAULT 0,
  skipped       INTEGER     NOT NULL DEFAULT 0,
  dry_run       BOOLEAN     NOT NULL DEFAULT false,
  UNIQUE (strategy_id, market_id)
);

CREATE INDEX IF NOT EXISTS strategy_decisions_strategy_idx
  ON strategy_decisions (strategy_id, decided_at DESC);

-- Upgrade existing deployments without discarding their completed decisions.
ALTER TABLE strategy_decisions DROP CONSTRAINT IF EXISTS strategy_decisions_gate_check;
ALTER TABLE strategy_decisions ADD CONSTRAINT strategy_decisions_gate_check CHECK (gate IN ('pending', 'trade', 'held', 'failed'));
ALTER TABLE strategy_decisions DROP CONSTRAINT IF EXISTS strategy_decisions_strategy_id_market_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS strategy_decisions_once_idx ON strategy_decisions (strategy_id, market_id, dry_run);

-- Reserved before any submission. An interrupted attempt is reconciled, never replayed.
CREATE TABLE IF NOT EXISTS strategy_attempts (
  kind TEXT NOT NULL DEFAULT 'order' CHECK (kind IN ('order', 'settle')),
  strategy_id TEXT NOT NULL,
  market_id TEXT NOT NULL,
  owner TEXT NOT NULL,
  runner TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('up', 'down')),
  stake_base TEXT NOT NULL,
  from_block TEXT NOT NULL,
  nonce INTEGER NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('attempting', 'filled', 'settled', 'nothing-filled', 'refused', 'reverted', 'unknown')),
  tx_hash TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (strategy_id, market_id, owner, kind)
);
CREATE INDEX IF NOT EXISTS strategy_attempts_runner_idx ON strategy_attempts (runner, state);
