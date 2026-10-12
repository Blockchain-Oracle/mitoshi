-- Ported from Owarine 90a91d71:packages/db/src/schema-games.ts (`arcade_scores`, D-226). Arcade scores are product
-- state with no chain counterpart; every board says "arcade score · not on-chain". A row is a run the server
-- replayed; it is never updated. Wallets are lowercased 0x addresses, written only by `/api/games/arcade/score`.
CREATE TABLE IF NOT EXISTS arcade_scores (
  id              BIGSERIAL   PRIMARY KEY,
  game            TEXT        NOT NULL CHECK (game IN ('line-rider', 'candle-hop')),
  wallet          TEXT        NOT NULL,
  score           INTEGER     NOT NULL CHECK (score >= 0),
  -- The engine build the run was produced by: a score from another build is not comparable.
  engine_version  INTEGER     NOT NULL,
  duration_ms     INTEGER     NOT NULL CHECK (duration_ms > 0),
  -- 'replayed' re-ran the trace. A run too long to replay is refused, never accepted on its envelope.
  checked         TEXT        NOT NULL CHECK (checked IN ('replayed', 'envelope')),
  -- The eight hex characters the run was drawn from, and a SHA-256 of the trace the server replayed.
  seed            TEXT,
  trace_hash      TEXT,
  -- The calmer ramp changes the mechanic, so the board says which runs took it.
  calm            BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arcade_scores_board_idx
  ON arcade_scores (game, engine_version, score DESC);

CREATE INDEX IF NOT EXISTS arcade_scores_wallet_idx
  ON arcade_scores (wallet, game, engine_version);
