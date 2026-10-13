-- S11 (D-227): "Sign in with X" keeps its state on the server. Owarine 90a91d71 carried OAuth's `state` and the PKCE
-- verifier in httpOnly cookies; here both live in this table, keyed by the SHA-256 of the state, and bound to the
-- browser that started (the SHA-256 of a random httpOnly cookie) and, when one was signed in, to the Mitoshi caller.
-- A row is taken (deleted) exactly once, inside its ten minutes. The app's sign-in handoff (`kind = 'native'`) keeps
-- its one-time code here too: good for sixty seconds, once, and only with the verifier whose S256 challenge it names.
CREATE TABLE IF NOT EXISTS x_oauth_states (
  -- sha256(state) for 'authorize', sha256(code) for 'native': the raw value never rests in the database.
  id_hash        TEXT        PRIMARY KEY,
  kind           TEXT        NOT NULL CHECK (kind IN ('authorize', 'native')),
  -- sha256 of the starting browser's `x_bind` cookie; null when the app started it (the PKCE challenge binds it).
  binding_hash   TEXT,
  -- The Mitoshi account signed in when the sign-in started, lowercased; null when none was.
  caller         TEXT,
  -- OAuth 2.0's PKCE verifier (authorize rows only).
  pkce_verifier  TEXT,
  -- The app's S256 challenge (the native handoff): the code it is exchanged for needs the verifier behind it.
  app_challenge  TEXT,
  -- The signed X session a native code hands to the app (native rows only).
  session        TEXT,
  return_path    TEXT,
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS x_oauth_states_expiry_idx ON x_oauth_states (expires_at);

-- The relay's attempts carry their executor and the block they were sent from in `details`; the recovery pass asks
-- for every unresolved one of its actor.
CREATE INDEX IF NOT EXISTS x_receipts_open_idx ON x_receipts (status, updated_at) WHERE status IN ('submitted', 'unknown');
