// Ported from Masayume 68f7a09:packages/core/src/schemas/reading.ts — the zod schema for a Reading; the type and its
// helpers live in `types/reading.ts` (zod-free, S23 gate).
import { z } from "zod";
import { STALE_REASONS } from "../types/reading";
import { diagnosisSchema } from "./diagnosis";

export function readingSchema<T extends z.ZodType>(inner: T) {
  return z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      value: inner,
      asOfMs: z.number(),
      stale: z.boolean(),
      staleReason: z.enum(STALE_REASONS).optional(),
    }),
    z.object({ ok: z.literal(false), error: diagnosisSchema }),
  ]);
}
