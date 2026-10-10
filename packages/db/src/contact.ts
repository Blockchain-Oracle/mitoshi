// `/contact`'s messages (S13 step 10; D34): submit, the open queue ops reads (`scripts/ops/moderate.ts contact`), close.
import type { Sql } from "./index";

export const CONTACT_TOPICS = ["problem", "report", "privacy", "question"] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export interface ContactMessage {
  id: string;
  topic: ContactTopic;
  body: string;
  email: string | null;
  address: string | null;
  createdAt: string;
}

export interface ContactStore {
  submit(input: { topic: ContactTopic; body: string; email: string | null; address: string | null }): Promise<string>;
  open(limit?: number): Promise<ContactMessage[]>;
  close(id: string): Promise<boolean>;
}

export function createPgContact(sql: Sql): ContactStore {
  return {
    async submit({ topic, body, email, address }) {
      const [row] = await sql<{ id: string }[]>`insert into contact_messages (topic, body, email, address) values (${topic}, ${body}, ${email}, ${address?.toLowerCase() ?? null}) returning id::text`;
      return row!.id;
    },
    async open(limit = 50) {
      const rows = await sql<{ id: string; topic: ContactTopic; body: string; email: string | null; address: string | null; created_at: Date }[]>`
        select id::text, topic, body, email, address, created_at from contact_messages where status = 'open' order by created_at limit ${limit}`;
      return rows.map((r) => ({ id: r.id, topic: r.topic, body: r.body, email: r.email, address: r.address, createdAt: r.created_at.toISOString() }));
    },
    async close(id) {
      const rows = await sql`update contact_messages set status = 'closed', closed_at = now() where id = ${id}::bigint and status = 'open' returning id`;
      return rows.length > 0;
    },
  };
}
