-- S13 steps 1–2: one session for every social write (UX fix 10), profiles, reactions, and the App Review safety set
-- (D-043): reports, blocks and hidden rows. Follows use `game_follows` (games/0001) — one follow graph for the product.

-- A take or a room message records the session it came through (a passkey session or the one social signature),
-- not a signature of its own: Agari's per-take signature is gone.
ALTER TABLE takes ALTER COLUMN signature DROP NOT NULL;
ALTER TABLE takes ADD COLUMN IF NOT EXISTS via TEXT CHECK (via IN ('passkey', 'social'));
ALTER TABLE takes ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;
ALTER TABLE room_comments ADD COLUMN IF NOT EXISTS via TEXT CHECK (via IN ('passkey', 'social'));
ALTER TABLE room_comments ADD COLUMN IF NOT EXISTS hidden_at TIMESTAMPTZ;

-- A public name for an address (Tradash: 3–20 letters, digits or underscores), unique without regard to case. Nothing
-- else about a person is stored: the avatar is the address's initials on its hue.
CREATE TABLE IF NOT EXISTS profiles (
  address       TEXT        PRIMARY KEY CHECK (address ~ '^0x[0-9a-f]{40}$'),
  display_name  TEXT        CHECK (display_name ~ '^[A-Za-z0-9_]{3,20}$'),
  bio           TEXT        CHECK (length(bio) <= 160),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_name_idx ON profiles (lower(display_name)) WHERE display_name IS NOT NULL;

-- One reaction of each kind per person per post; the set of kinds is fixed in code.
CREATE TABLE IF NOT EXISTS reactions (
  target_kind  TEXT        NOT NULL CHECK (target_kind IN ('comment', 'take')),
  target_id    BIGINT      NOT NULL,
  reactor      TEXT        NOT NULL,
  kind         TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (target_kind, target_id, reactor, kind)
);
CREATE INDEX IF NOT EXISTS reactions_target_idx ON reactions (target_kind, target_id);

-- A report reaches the moderation queue (ops `GET /internal/moderation`); a moderator hides the row or dismisses it.
CREATE TABLE IF NOT EXISTS social_reports (
  id           BIGSERIAL   PRIMARY KEY,
  reporter     TEXT        NOT NULL,
  target_kind  TEXT        NOT NULL CHECK (target_kind IN ('comment', 'take', 'profile', 'agent', 'token')),
  target_id    TEXT        NOT NULL,
  -- The reported author, when the target has one (a comment's, a take's, the profile's address).
  target_author TEXT,
  reason       TEXT        NOT NULL CHECK (reason IN ('spam', 'abuse', 'scam', 'impersonation', 'illegal', 'other')),
  note         TEXT        CHECK (length(note) <= 500),
  status       TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'actioned', 'dismissed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at  TIMESTAMPTZ,
  UNIQUE (reporter, target_kind, target_id)
);
CREATE INDEX IF NOT EXISTS social_reports_open_idx ON social_reports (created_at) WHERE status = 'open';

-- A block hides the blocked address's posts from the blocker's feeds and rooms (both ways for rooms is not promised).
CREATE TABLE IF NOT EXISTS social_blocks (
  blocker     TEXT        NOT NULL,
  blocked     TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
