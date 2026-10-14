/** Erase app-owned account records in one database transaction. Chain-derived indexes and abuse ledgers stay. */
import type { Sql } from "./index";

export async function deleteAccountOwnedData(sql: Sql, address: string): Promise<void> {
  const a = address.toLowerCase();
  await sql.begin(async (tx) => {
    // X delivery rows reference receipts. Remove the account's instructions and OAuth links together.
    await tx`delete from x_reply_delivery where mention_id in (select mention_id from x_receipts where wallet = ${a})`;
    await tx`delete from x_receipts where wallet = ${a}`;
    await tx`delete from x_links where wallet = ${a}`;
    await tx`delete from x_oauth_states where caller = ${a}`;

    await tx`delete from reactions where (target_kind = 'take' and target_id in (select id from takes where author = ${a}))
      or (target_kind = 'comment' and target_id in (select id from room_comments where author = ${a})) or reactor = ${a}`;
    await tx`delete from takes where author = ${a}`;
    await tx`delete from room_comments where author = ${a}`;
    await tx`delete from game_follows where follower = ${a} or followee = ${a}`;
    await tx`delete from social_blocks where blocker = ${a}`;
    await tx`delete from social_reports where reporter = ${a}`;
    await tx`delete from profiles where address = ${a}`;
    await tx`delete from bettors where wallet = ${a}`;
    await tx`delete from game_profiles where wallet = ${a}`;
    await tx`delete from game_settings where wallet = ${a}`;
    await tx`delete from game_ratings where wallet = ${a}`;
    await tx`delete from game_rating_events where wallet = ${a}`;
    await tx`delete from arcade_scores where wallet = ${a}`;
    await tx`delete from lucky_draws where wallet = ${a}`;
    await tx`delete from duel_queue where wallet = ${a}`;
    await tx`delete from contact_messages where address = ${a}`;

    await tx`delete from strategy_playbooks where creator = ${a}`;
    await tx`delete from strategy_sealed_memory where creator = ${a}`;
    await tx`delete from passkey_backups where account = ${a}`;
  });
}
