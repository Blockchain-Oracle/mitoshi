-- The duel's queue and Mitoshi's 5-minute lane (R4-9, D-227). Masayume 68f7a09 paired players in the matchmaker's
-- memory (services/ops/src/actors/matchmaker/pending.ts); Mitoshi pairs on the web server, so the waiting list is a
-- row per wallet: its tier, the client seed it committed to before seeing any deck, and the match it was paired into.
-- A row with no match older than the pairing window is stale and never paired.
CREATE TABLE IF NOT EXISTS duel_queue (
  wallet       TEXT        PRIMARY KEY,
  tier         TEXT        NOT NULL CHECK (tier IN ('free', 't1', 't5', 't10')),
  client_seed  TEXT        NOT NULL,
  match_id     TEXT,
  queued_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS duel_queue_waiting_idx
  ON duel_queue (tier, queued_at) WHERE match_id IS NULL;

-- A venue that names the 5m cadence (core DeckPolicy.cadences) deals a '5m' lane; the check allows it beside 15m, 1h, mixed.
ALTER TABLE duel_decks DROP CONSTRAINT IF EXISTS duel_decks_lane_check;
ALTER TABLE duel_decks ADD CONSTRAINT duel_decks_lane_check CHECK (lane IN ('5m', '15m', '1h', 'mixed'));
