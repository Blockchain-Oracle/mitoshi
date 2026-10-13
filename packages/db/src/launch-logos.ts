// `/launch*`'s logos (S17; R4-11, D-227): stored once by the sha256 of their bytes (`migrations/launch/0001`), served by
// `/api/launch/logo/<sha>` so a token's `logoURI` stays under the TIP-20's 256 bytes.
import type { Sql } from "./index";

export type LogoType = "image/png" | "image/jpeg" | "image/webp";
export interface LaunchLogo { sha256: string; contentType: LogoType; bytes: Uint8Array; width: number; height: number }

export interface LaunchLogoStore {
  /** Idempotent: the same bytes return the same sha. */
  put(logo: LaunchLogo): Promise<string>;
  get(sha256: string): Promise<LaunchLogo | null>;
}

export function createPgLaunchLogos(sql: Sql): LaunchLogoStore {
  return {
    async put({ sha256, contentType, bytes, width, height }) {
      await sql`insert into launch_logos (sha256, content_type, bytes, width, height) values (${sha256}, ${contentType}, ${Buffer.from(bytes)}, ${width}, ${height}) on conflict (sha256) do nothing`;
      return sha256;
    },
    async get(sha256) {
      const [row] = await sql<{ sha256: string; content_type: LogoType; bytes: Buffer; width: number; height: number }[]>`
        select sha256, content_type, bytes, width, height from launch_logos where sha256 = ${sha256}`;
      return row ? { sha256: row.sha256, contentType: row.content_type, bytes: new Uint8Array(row.bytes), width: row.width, height: row.height } : null;
    },
  };
}
