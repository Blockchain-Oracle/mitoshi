// Backup passkeys (S13 step 10, D-053; `keys/0002`): which account a backup credential signs in as.
import type { Sql } from "./index";

export interface PasskeyBackup {
  credentialId: string;
  keyId: string;
  publicKey: string;
  account: string;
  name: string | null;
  createdAt: string;
}

export interface PasskeyBackupStore {
  add(row: Omit<PasskeyBackup, "createdAt">): Promise<boolean>;
  /** The account a backup key belongs to, by its key id (the address of its public key). */
  accountOfKey(keyId: string): Promise<string | null>;
  forAccount(account: string): Promise<PasskeyBackup[]>;
}

type Row = { credential_id: string; key_id: string; public_key: string; account: string; name: string | null; created_at: Date };
const view = (r: Row): PasskeyBackup => ({ credentialId: r.credential_id, keyId: r.key_id, publicKey: r.public_key, account: r.account, name: r.name, createdAt: r.created_at.toISOString() });

export function createPgPasskeyBackups(sql: Sql): PasskeyBackupStore {
  return {
    async add({ credentialId, keyId, publicKey, account, name }) {
      const rows = await sql`insert into passkey_backups (credential_id, key_id, public_key, account, name)
        values (${credentialId}, ${keyId.toLowerCase()}, ${publicKey}, ${account.toLowerCase()}, ${name}) on conflict (credential_id) do nothing returning credential_id`;
      return rows.length > 0;
    },
    async accountOfKey(keyId) {
      const [row] = await sql<{ account: string }[]>`select account from passkey_backups where key_id = ${keyId.toLowerCase()} order by created_at desc limit 1`;
      return row?.account ?? null;
    },
    async forAccount(account) {
      return (await sql<Row[]>`select * from passkey_backups where account = ${account.toLowerCase()} order by created_at`).map(view);
    },
  };
}
