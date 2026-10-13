-- Engine v2's terrain (R4-9, D-227): the tape of real RedStone prints the server issued with a run's seed, kept so the
-- score check replays the run on exactly the terrain it was played on. A seed is only rankable if it was issued here;
-- `points` is empty when the index had no prints to cut a tape from (the run then plays on the seed's own line).
CREATE TABLE IF NOT EXISTS arcade_tapes (
  seed        TEXT        PRIMARY KEY,
  game        TEXT        NOT NULL CHECK (game IN ('line-rider', 'candle-hop')),
  -- The feed the prints are of ('BTC', 'ETH'), and the span they cover, in unix seconds.
  feed        TEXT        NOT NULL,
  from_sec    BIGINT      NOT NULL,
  to_sec      BIGINT      NOT NULL,
  -- Each print normalised over the tape's own range to 0..1000 (core's TAPE_Q), oldest first: Candle Hop's canyon.
  points      JSONB       NOT NULL,
  -- Each print's change from the one before, in tenths of a basis point: Line Rider's sled terrain.
  moves       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
