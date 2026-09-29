-- Ported from Masayume 68f7a09:packages/db/src/schema-games.ts (inline SQL constants → an ordered migration, D-031).
-- Slice 7 re-keyed duel_cards from the chain's log identity to the pick's own coordinates — the table
-- below says why. Nothing had written it (the projector is its first writer), so the old shape is
-- dropped rather than migrated, and only where it is actually present. This guard can go once no
-- database in use predates 2026-09-03.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'duel_cards' AND column_name = 'log_key'
  ) THEN
    DROP TABLE duel_cards;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS game_profiles (
  -- Lowercased 0x address, verified from a signature before upsert.
  wallet        TEXT        PRIMARY KEY,
  -- The accent the player picked for their stage and share cards; one of the shell's own tokens.
  accent        TEXT        NOT NULL DEFAULT 'default',
  -- Consecutive days with at least one verified game. Recomputed by ops, never incremented by a client.
  streak_days   INTEGER     NOT NULL DEFAULT 0,
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS game_settings (
  wallet          TEXT        PRIMARY KEY,
  sound           BOOLEAN     NOT NULL DEFAULT true,
  haptics         BOOLEAN     NOT NULL DEFAULT true,
  -- The player's explicit choice. Absent, the stage still follows the OS's prefers-reduced-motion.
  reduced_motion  BOOLEAN,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Directional follows, the owner's decision: no approval handshake, so following is never blocked on
-- someone else acting. A mutual pair is simply two rows.
CREATE TABLE IF NOT EXISTS game_follows (
  follower    TEXT        NOT NULL,
  followee    TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower, followee),
  CHECK (follower <> followee)
);

CREATE INDEX IF NOT EXISTS game_follows_followee_idx
  ON game_follows (followee, created_at DESC);

-- One transparent Elo ladder: 1000 to start, K=48 for the first ten verified matches, then K=24.
CREATE TABLE IF NOT EXISTS game_ratings (
  wallet            TEXT        PRIMARY KEY,
  rating            INTEGER     NOT NULL DEFAULT 1000,
  -- Matches that reached a real result. Refunds and void-only matches are excluded, so they cannot
  -- push a player out of their provisional window without the ladder having learned anything.
  verified_matches  INTEGER     NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_ratings_ladder_idx
  ON game_ratings (rating DESC);

-- One row per player per terminal match, and the reason the ladder can be re-projected safely.
--
-- The projector may re-read a block: a cursor is a high-water mark, not a promise, and a restart or a
-- rewind replays what it already saw. Every other row it writes is an upsert, so replaying is a no-op —
-- but a rating is an INCREMENT, and an increment applied twice is a ladder nobody can audit. So the
-- delta is recorded here first, under a primary key the chain decided, and the rating only moves when
-- that insert is the one that won.
CREATE TABLE IF NOT EXISTS game_rating_events (
  match_id         TEXT        NOT NULL,
  wallet           TEXT        NOT NULL,
  delta            INTEGER     NOT NULL,
  rating_after     INTEGER     NOT NULL,
  -- Bumped when the formula changes, so an old row is never mistaken for one this K would have produced.
  formula_version  INTEGER     NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, wallet)
);

CREATE INDEX IF NOT EXISTS game_rating_events_wallet_idx
  ON game_rating_events (wallet, created_at DESC);

CREATE TABLE IF NOT EXISTS duel_matches (
  -- The arena's own match id, hex. Unique per chain, so the chain id rides along for a multi-chain read.
  match_id        TEXT        PRIMARY KEY,
  chain_id        INTEGER     NOT NULL,
  arena           TEXT        NOT NULL,
  mode            TEXT        NOT NULL CHECK (mode IN ('free', 'ranked')),
  tier            TEXT        NOT NULL CHECK (tier IN ('free', 't1', 't5', 't10')),
  creator         TEXT        NOT NULL,
  challenger      TEXT,
  status          TEXT        NOT NULL CHECK (status IN
                    ('waiting','activeUnrevealed','picking','settling','finalized','refunded','forfeited')),
  deck_hash       TEXT        NOT NULL,
  deck_size       INTEGER     NOT NULL CHECK (deck_size BETWEEN 2 AND 5),
  policy_version  INTEGER     NOT NULL,
  -- Base units as decimal strings, never floats — the same rule the strategy fills follow.
  pot_per_player  TEXT        NOT NULL,
  -- The revealed deck's market ids, in deck order. Null until the deck is opened. Kept so a history
  -- page renders without a chain read; the arena's own "deckOf" remains the authority.
  cards           JSONB,
  -- Only the refund event carries this, and the record cannot re-derive it: a creator who cancelled
  -- an unjoined match and one whose join window ran out leave identical state behind.
  refund_reason   TEXT        CHECK (refund_reason IN
                    ('creator-cancelled','join-timeout','reveal-unavailable','both-incomplete')),
  winner          TEXT,
  creator_pnl     TEXT,
  challenger_pnl  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS duel_matches_creator_idx
  ON duel_matches (creator, created_at DESC);

CREATE INDEX IF NOT EXISTS duel_matches_challenger_idx
  ON duel_matches (challenger, created_at DESC);

CREATE TABLE IF NOT EXISTS duel_cards (
  -- The pick's own coordinates, "chainId:matchId:cardIndex:seat" (core's "arenaPickKey"). NOT the chain's
  -- log identity: one card emits "PickFilled" and later "CardSettled", so a log-keyed row would store a
  -- settled card twice instead of filling in its payout. Re-indexing either event writes the same row.
  pick_key      TEXT        PRIMARY KEY,
  match_id      TEXT        NOT NULL,
  card_index    INTEGER     NOT NULL,
  player        TEXT        NOT NULL,
  market_id     TEXT        NOT NULL,
  side          TEXT        NOT NULL CHECK (side IN ('up', 'down')),
  -- Measured by the arena around the IOC, not quoted by a screen. Decimal strings.
  quantity      TEXT        NOT NULL,
  cost          TEXT        NOT NULL,
  -- Null until the card settles; a voided card still pays its real redemption.
  payout        TEXT,
  filled_at_sec BIGINT      NOT NULL,
  UNIQUE (match_id, card_index, player)
);

CREATE INDEX IF NOT EXISTS duel_cards_match_idx
  ON duel_cards (match_id, card_index);

CREATE INDEX IF NOT EXISTS duel_cards_player_idx
  ON duel_cards (player, filled_at_sec DESC);

-- How far the projector has read. One row per (chain, contract, purpose), so a restart resumes from the
-- last block it wrote rather than from the deployment — and re-reading a block is harmless, because every
-- row it writes is keyed by something the chain already decided.
CREATE TABLE IF NOT EXISTS game_cursors (
  name        TEXT        PRIMARY KEY,
  block       BIGINT      NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The reveal material for a committed deck, encrypted at rest.
--
-- The rule this table exists for: no durable reveal, no join. The deckmaster writes here BEFORE it
-- publishes a commitment, because a commitment whose preimage was lost is a match that can only ever
-- refund. "revealDeck" is permissionless, so anyone holding this material can open the deck — which is
-- why it is sealed with a key that is not in the database, and why the row is deleted once the arena
-- has the cards in the clear.
CREATE TABLE IF NOT EXISTS duel_decks (
  match_id        TEXT        PRIMARY KEY,
  chain_id        INTEGER     NOT NULL,
  arena           TEXT        NOT NULL,
  policy_version  INTEGER     NOT NULL,
  -- Which lane the policy dealt from: '15m', '1h' or 'mixed' when the venue ran too few of one cadence.
  lane            TEXT        NOT NULL CHECK (lane IN ('15m', '1h', 'mixed')),
  cards           JSONB       NOT NULL,
  -- AES-256-GCM, base64url: iv, ciphertext and tag in one string. The key lives in the environment.
  sealed          TEXT        NOT NULL,
  revealed_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Arcade scores are product state and say so on every board: "arcade score · not on-chain".
CREATE TABLE IF NOT EXISTS arcade_scores (
  id              BIGSERIAL   PRIMARY KEY,
  game            TEXT        NOT NULL CHECK (game IN ('line-rider', 'candle-hop')),
  wallet          TEXT        NOT NULL,
  score           INTEGER     NOT NULL CHECK (score >= 0),
  -- The engine build the run was produced by: a score from an older engine is not comparable.
  engine_version  INTEGER     NOT NULL,
  duration_ms     INTEGER     NOT NULL CHECK (duration_ms > 0),
  -- What the server checked before accepting: 'replayed' re-ran the trace, 'envelope' only bounded it.
  -- Slice 4 writes 'replayed' only: a run too long to replay is refused, never accepted on its envelope.
  checked         TEXT        NOT NULL CHECK (checked IN ('replayed', 'envelope')),
  -- The eight hex characters the run's line or candles were drawn from, and a SHA-256 of the trace the
  -- server replayed — enough to say later which run a row was, without keeping every input.
  seed            TEXT,
  trace_hash      TEXT,
  -- The calmer ramp reduced motion offers. It changes the mechanic, so the board says which runs took it.
  calm            BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS arcade_scores_board_idx
  ON arcade_scores (game, engine_version, score DESC);

CREATE INDEX IF NOT EXISTS arcade_scores_wallet_idx
  ON arcade_scores (wallet, created_at DESC);

-- A board is one row per wallet — its best — so the lookup is by wallet inside a game and build.
CREATE INDEX IF NOT EXISTS arcade_scores_best_idx
  ON arcade_scores (game, engine_version, wallet, score DESC);

-- Slice 4's columns on a table slice 1 may already have created; the CREATE above is the fresh shape.
ALTER TABLE arcade_scores ADD COLUMN IF NOT EXISTS seed TEXT;
ALTER TABLE arcade_scores ADD COLUMN IF NOT EXISTS trace_hash TEXT;
ALTER TABLE arcade_scores ADD COLUMN IF NOT EXISTS calm BOOLEAN NOT NULL DEFAULT false;
-- One Lucky spin, from the commitment to the chain's verdict (slice 5).
--
-- The seed is written at commit, not at reveal: a Next route on Vercel keeps no memory between two
-- requests, so a seed held "until the client seed arrives" would be a seed lost on the second one. That
-- is safe for fairness because nothing here is on chain — the commitment is what the browser saw before
-- it chose its seed, and a row nobody but the server can read cannot change what that hash binds. Every
-- money column is a decimal string in base units, and the row's result is the only economic claim it
-- makes: 'pending' onward is written from a fill the tape shows and a settlement the chain decided.
CREATE TABLE IF NOT EXISTS lucky_draws (
  draw_id             TEXT        PRIMARY KEY,
  wallet              TEXT        NOT NULL,
  nonce               INTEGER     NOT NULL,
  policy_version      INTEGER     NOT NULL,
  stake_base          TEXT        NOT NULL,
  commitment          TEXT        NOT NULL,
  server_seed         TEXT        NOT NULL,
  -- Null until the browser reveals its seed; the deal's fields below fill in with it.
  client_seed         TEXT,
  asset               TEXT,
  side                TEXT        CHECK (side IN ('up', 'down')),
  multiplier          INTEGER,
  -- keccak256 of the eligible Windows' ids under the policy: what the chooser was allowed to pick from.
  candidate_hash      TEXT,
  market_id           TEXT,
  quote_avg_price_bps INTEGER,
  quote_contracts_raw TEXT,
  tx_hash             TEXT,
  -- Measured from the wallet's own fills for that transaction, never from the quote.
  cost_base           TEXT,
  quantity_raw        TEXT,
  result              TEXT        NOT NULL CHECK (result IN
                        ('drawn','placed','pending','won','lost','void','cashed-out','refused','unknown')),
  -- Why a row is 'refused': the venue was thin, the signature was declined, the fill crossed nothing.
  refusal             TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  revealed_at         TIMESTAMPTZ,
  placed_at           TIMESTAMPTZ,
  settled_at          TIMESTAMPTZ,
  UNIQUE (wallet, nonce)
);

CREATE INDEX IF NOT EXISTS lucky_draws_wallet_idx
  ON lucky_draws (wallet, created_at DESC);

CREATE INDEX IF NOT EXISTS lucky_draws_result_idx
  ON lucky_draws (result);

-- Slice 7 added three columns to tables slice 1 may already have created. Both forms are here on
-- purpose: the CREATE above is what a fresh database gets, and these are what an existing one needs.
ALTER TABLE duel_matches ADD COLUMN IF NOT EXISTS cards JSONB;
ALTER TABLE duel_matches ADD COLUMN IF NOT EXISTS refund_reason TEXT;

-- The owner lowered minDeckSize to 2 on 2026-09-03 (the venue supplies two Windows per cadence), so a
-- database created before that carries a CHECK no legal deck can satisfy.
ALTER TABLE duel_matches DROP CONSTRAINT IF EXISTS duel_matches_deck_size_check;
ALTER TABLE duel_matches ADD CONSTRAINT duel_matches_deck_size_check CHECK (deck_size BETWEEN 2 AND 5);

-- Addresses were written in whatever case the decoder produced (viem checksums an address off a log)
-- and read back through lower(), so no query ever matched its own rows. The key() helper in games.ts
-- fixes the writes; these repair what a build before it wrote. Idempotent, and not applied to the
-- primary keys, which are hashes and were already lowercase by construction.
UPDATE duel_matches SET arena = lower(arena) WHERE arena <> lower(arena);
UPDATE duel_matches SET creator = lower(creator) WHERE creator <> lower(creator);
UPDATE duel_matches SET challenger = lower(challenger) WHERE challenger IS NOT NULL AND challenger <> lower(challenger);
UPDATE duel_matches SET winner = lower(winner) WHERE winner IS NOT NULL AND winner <> lower(winner);
UPDATE duel_matches SET deck_hash = lower(deck_hash) WHERE deck_hash <> lower(deck_hash);
UPDATE duel_cards SET player = lower(player) WHERE player <> lower(player);
UPDATE duel_cards SET market_id = lower(market_id) WHERE market_id <> lower(market_id);
