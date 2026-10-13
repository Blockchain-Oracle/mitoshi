-- `/launch*`'s logos (S17; R4-11, D-227): a TIP-20's `logoURI` holds at most 256 bytes, so the image lives here, keyed by
-- the sha256 of its bytes, and the token carries `${origin}/api/launch/logo/<sha>`. Write-once: the same bytes are the
-- same row, and a launched token's logo never changes under it.
create table if not exists launch_logos (
  sha256 text primary key check (sha256 ~ '^[0-9a-f]{64}$'),
  content_type text not null check (content_type in ('image/png', 'image/jpeg', 'image/webp')),
  bytes bytea not null check (octet_length(bytes) <= 262144),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  created_at timestamptz not null default now()
);
