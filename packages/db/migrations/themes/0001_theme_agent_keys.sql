-- The theme agent's keys (S16a; R4-11, D-227; plan B.4.3): one secp256k1 key per (follower, theme), made and held by ops
-- only. The web app files a request row (follower, theme) and reads back the key's address; ops fills it with a key it
-- generates and seals (AES-256-GCM under THEME_KEYS_SECRET, which only ops holds) — the web process never sees a key.
create table if not exists theme_agent_keys (
  id bigserial primary key,
  follower text not null check (follower ~ '^0x[0-9a-f]{40}$'),
  theme_id bigint not null check (theme_id > 0),
  key_id text check (key_id ~ '^0x[0-9a-f]{40}$'),
  sealed bytea,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  last_pass_at timestamptz,
  last_note text,
  unique (follower, theme_id)
);
create index if not exists theme_agent_keys_pending on theme_agent_keys (requested_at) where key_id is null;
