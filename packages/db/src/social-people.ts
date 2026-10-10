/**
 * People in the social layer (S13): a profile's public name, follows (`game_follows`, the product's one follow graph)
 * and blocks (D-043). Addresses are stored lower-case; every function lower-cases what it is given.
 */
import type { Sql } from "./index";

export interface Profile {
  address: string;
  displayName: string | null;
  bio: string | null;
}

export type SetProfileResult = { ok: true; profile: Profile } | { ok: false; reason: "name_taken" | "bad_name" | "bad_bio" };

export const DISPLAY_NAME = /^[A-Za-z0-9_]{3,20}$/;
export const BIO_MAX = 160;

const lc = (a: string) => a.toLowerCase();

export interface SocialPeopleStore {
  profiles(addresses: readonly string[]): Promise<Map<string, Profile>>;
  setProfile(address: string, next: { displayName: string | null; bio: string | null }): Promise<SetProfileResult>;
  /** The address behind a public name, case-insensitive. */
  byName(name: string): Promise<string | null>;
  follow(follower: string, followee: string): Promise<void>;
  unfollow(follower: string, followee: string): Promise<void>;
  followCounts(address: string): Promise<{ followers: number; following: number }>;
  following(address: string): Promise<string[]>;
  isFollowing(follower: string, followee: string): Promise<boolean>;
  block(blocker: string, blocked: string): Promise<void>;
  unblock(blocker: string, blocked: string): Promise<void>;
  blockedBy(blocker: string): Promise<string[]>;
}

export function createPgSocialPeople(sql: Sql): SocialPeopleStore {
  return {
    async profiles(addresses) {
      const list = [...new Set(addresses.map(lc))];
      if (list.length === 0) return new Map();
      const rows = await sql<{ address: string; display_name: string | null; bio: string | null }[]>`
        select address, display_name, bio from profiles where address = any(${list}::text[])`;
      return new Map(rows.map((r) => [r.address, { address: r.address, displayName: r.display_name, bio: r.bio }]));
    },
    async setProfile(address, next) {
      if (next.displayName !== null && !DISPLAY_NAME.test(next.displayName)) return { ok: false, reason: "bad_name" };
      if (next.bio !== null && next.bio.length > BIO_MAX) return { ok: false, reason: "bad_bio" };
      try {
        const [r] = await sql<{ address: string; display_name: string | null; bio: string | null }[]>`
          insert into profiles (address, display_name, bio, updated_at) values (${lc(address)}, ${next.displayName}, ${next.bio}, now())
          on conflict (address) do update set display_name = excluded.display_name, bio = excluded.bio, updated_at = now()
          returning address, display_name, bio`;
        return { ok: true, profile: { address: r!.address, displayName: r!.display_name, bio: r!.bio } };
      } catch (e) {
        if ((e as { code?: string }).code === "23505") return { ok: false, reason: "name_taken" };
        throw e;
      }
    },
    async byName(name) {
      const [r] = await sql<{ address: string }[]>`select address from profiles where lower(display_name) = lower(${name})`;
      return r?.address ?? null;
    },
    async follow(follower, followee) {
      if (lc(follower) === lc(followee)) return;
      await sql`insert into game_follows (follower, followee) values (${lc(follower)}, ${lc(followee)}) on conflict do nothing`;
    },
    async unfollow(follower, followee) {
      await sql`delete from game_follows where follower = ${lc(follower)} and followee = ${lc(followee)}`;
    },
    async followCounts(address) {
      const [r] = await sql<{ followers: number; following: number }[]>`
        select (select count(*)::int from game_follows where followee = ${lc(address)}) as followers,
               (select count(*)::int from game_follows where follower = ${lc(address)}) as following`;
      return { followers: r!.followers, following: r!.following };
    },
    async following(address) {
      const rows = await sql<{ followee: string }[]>`select followee from game_follows where follower = ${lc(address)} order by created_at desc`;
      return rows.map((r) => r.followee);
    },
    async isFollowing(follower, followee) {
      const [r] = await sql`select 1 from game_follows where follower = ${lc(follower)} and followee = ${lc(followee)}`;
      return r !== undefined;
    },
    async block(blocker, blocked) {
      if (lc(blocker) === lc(blocked)) return;
      await sql`insert into social_blocks (blocker, blocked) values (${lc(blocker)}, ${lc(blocked)}) on conflict do nothing`;
    },
    async unblock(blocker, blocked) {
      await sql`delete from social_blocks where blocker = ${lc(blocker)} and blocked = ${lc(blocked)}`;
    },
    async blockedBy(blocker) {
      const rows = await sql<{ blocked: string }[]>`select blocked from social_blocks where blocker = ${lc(blocker)}`;
      return rows.map((r) => r.blocked);
    },
  };
}
