-- `print_archive.summary` and `.feeds` were written as `${JSON.stringify(x)}::jsonb`, which postgres.js serialized a
-- second time: every row holds a JSON *string*, so `feeds -> 'BTC'`, `feeds ? 'BTC'` and every reader (the relay's
-- archive proofs, the calendar's RedStone observations, `/prices/latest`'s fallback, the web's archive route) saw
-- nothing (D-188). The writers now pass `sql.json(value)`; this unwraps the rows already stored. Idempotent.
update print_archive set summary = (summary #>> '{}')::jsonb where jsonb_typeof(summary) = 'string';
update print_archive set feeds = (feeds #>> '{}')::jsonb where jsonb_typeof(feeds) = 'string';
