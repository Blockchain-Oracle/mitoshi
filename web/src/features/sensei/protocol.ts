// Ported from Agari 03b30ab:web/src/features/sensei/protocol.ts (S13 step 8) — Mitoshi's figures: the Window's lane,
// positions by where they are held, and the consent the question rides on. Server-validated; the client imports types
// only, so zod never reaches the browser.
import type { LaneBasis, SessionState } from "@cwf/core";
import { z } from "zod";

const SESSION_STATES = ["pre", "regular", "early-close", "halted", "post", "closed", "holiday"] as const satisfies readonly SessionState[];
const LANES = ["regular", "gap", "crypto24", "stock24"] as const satisfies readonly LaneBasis[];
const cents = z.number().int().min(0).max(1e12);

/** One live Window as the terminal reads it: the line in dollars, each side's price in cents from the top of the book. */
export const senseiWindowSchema = z.object({
  asset: z.string().max(16),
  cadence: z.string().max(8),
  lane: z.enum(LANES),
  minsToClose: z.number().int().min(0).max(100_000),
  lineUsd: z.number().nonnegative().nullable(),
  upCents: z.number().int().min(0).max(100).nullable(),
  downCents: z.number().int().min(0).max(100).nullable(),
});

export const senseiSnapshotSchema = z.object({
  prices: z.record(z.string().max(16), z.number().nonnegative()),
  windows: z.array(senseiWindowSchema).max(8),
});

export const senseiSessionSchema = z.object({ state: z.enum(SESSION_STATES), label: z.string().max(60) });

/** One open position. Money in integer cents; nothing here names the wallet. */
export const senseiPositionSchema = z.object({
  asset: z.string().max(16),
  cadence: z.string().max(8),
  side: z.enum(["up", "down"]),
  via: z.enum(["wallet", "vault", "boost"]),
  stakeCents: cents,
  /** What Close pays now; null while the book can't price it. */
  markCents: cents.nullable(),
  minsToClose: z.number().int().min(0).max(100_000),
});

/** Settled rounds; `streak` is signed: +3 won the last three, −3 lost the last three. */
export const senseiRecordSchema = z.object({
  settled: z.number().int().min(0).max(1e6),
  wins: z.number().int().min(0).max(1e6),
  losses: z.number().int().min(0).max(1e6),
  streak: z.number().int().min(-1e6).max(1e6),
});

/** A report date within the lookahead (ops' Finnhub calendar), ET. */
export const senseiEarningsSchema = z.object({
  symbol: z.string().max(16),
  dateEt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  hour: z.enum(["bmo", "amc", "dmh"]).nullable(),
});

export const senseiRequestSchema = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4_000) })).min(1).max(12),
  /** The agreement this question rides on; the route checks it against the provider it would send to. */
  consent: z.object({ version: z.string().max(20), provider: z.string().max(40) }),
  snapshot: senseiSnapshotSchema.nullable(),
  restless: z.boolean(),
  session: senseiSessionSchema.nullable().optional(),
  positions: z.array(senseiPositionSchema).max(8).optional(),
  record: senseiRecordSchema.optional(),
  /** Null: the calendar couldn't be read; absent: not asked for (no stock on screen). */
  earnings: z.array(senseiEarningsSchema).max(10).nullable().optional(),
});

export type SenseiWindow = z.infer<typeof senseiWindowSchema>;
export type SenseiSnapshot = z.infer<typeof senseiSnapshotSchema>;
export type SenseiSession = z.infer<typeof senseiSessionSchema>;
export type SenseiPosition = z.infer<typeof senseiPositionSchema>;
export type SenseiRecord = z.infer<typeof senseiRecordSchema>;
export type SenseiEarnings = z.infer<typeof senseiEarningsSchema>;
export type SenseiRequest = z.infer<typeof senseiRequestSchema>;
/** What the page reads for a question: everything in the request but the thread, the consent and the pace. */
export type SenseiContext = Pick<SenseiRequest, "snapshot" | "session" | "positions" | "record" | "earnings">;

/** What `GET /api/sensei` answers: whether Sensei is on, and who would receive a question (the consent names them). */
export interface SenseiStatus {
  on: boolean;
  /** The provider as the brain names it ("anthropic"); the consent is kept per provider. */
  provider: string | null;
  /** Who receives the text, in order, for the consent: "Anthropic (Claude)", or a gateway then the provider. */
  recipients: string[];
  model: string | null;
  network: "testnet" | "mainnet";
}

export interface SenseiMessage {
  role: "user" | "assistant";
  content: string;
  /** A failure notice in the thread, not a read: never sent back to the model. */
  failed?: true;
}
