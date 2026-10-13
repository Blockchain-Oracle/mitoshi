// The theme agent's keys (S16a; R4-11, D-227; `migrations/themes/0001`): the web files a request per (follower, theme)
// and reads the key's address back; ops issues the key (sealed) and records each pass's note.
import type { Sql } from "./index";

export interface ThemeKeyRow { id: string; follower: string; themeId: bigint; keyId: string | null; sealed: Uint8Array | null; lastNote: string | null }

export interface ThemeKeyStore {
  /** Idempotent: one row per (follower, theme); returns it as it stands. */
  request(follower: string, themeId: bigint): Promise<ThemeKeyRow>;
  get(follower: string, themeId: bigint): Promise<ThemeKeyRow | null>;
  pending(limit?: number): Promise<ThemeKeyRow[]>;
  issue(id: string, keyId: string, sealed: Uint8Array): Promise<void>;
  issued(limit?: number): Promise<ThemeKeyRow[]>;
  note(id: string, note: string): Promise<void>;
}

type Raw = { id: string; follower: string; theme_id: string; key_id: string | null; sealed: Buffer | null; last_note: string | null };
const row = (r: Raw): ThemeKeyRow => ({ id: r.id, follower: r.follower, themeId: BigInt(r.theme_id), keyId: r.key_id, sealed: r.sealed ? new Uint8Array(r.sealed) : null, lastNote: r.last_note });

export function createPgThemeKeys(sql: Sql): ThemeKeyStore {
  return {
    async request(follower, themeId) {
      const f = follower.toLowerCase();
      await sql`insert into theme_agent_keys (follower, theme_id) values (${f}, ${themeId.toString()}) on conflict (follower, theme_id) do nothing`;
      const [r] = await sql<Raw[]>`select id::text, follower, theme_id::text, key_id, sealed, last_note from theme_agent_keys where follower = ${f} and theme_id = ${themeId.toString()}`;
      return row(r!);
    },
    async get(follower, themeId) {
      const [r] = await sql<Raw[]>`select id::text, follower, theme_id::text, key_id, sealed, last_note from theme_agent_keys where follower = ${follower.toLowerCase()} and theme_id = ${themeId.toString()}`;
      return r ? row(r) : null;
    },
    async pending(limit = 20) {
      return (await sql<Raw[]>`select id::text, follower, theme_id::text, key_id, sealed, last_note from theme_agent_keys where key_id is null order by requested_at limit ${limit}`).map(row);
    },
    async issue(id, keyId, sealed) {
      await sql`update theme_agent_keys set key_id = ${keyId.toLowerCase()}, sealed = ${Buffer.from(sealed)}, issued_at = now() where id = ${id}::bigint and key_id is null`;
    },
    async issued(limit = 200) {
      return (await sql<Raw[]>`select id::text, follower, theme_id::text, key_id, sealed, last_note from theme_agent_keys where key_id is not null order by id limit ${limit}`).map(row);
    },
    async note(id, note) {
      await sql`update theme_agent_keys set last_pass_at = now(), last_note = ${note.slice(0, 300)} where id = ${id}::bigint`;
    },
  };
}
