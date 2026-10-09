/**
 * The exit trigger's wire schema (zod), for the server that accepts a signed trigger (`/api/exits`). Kept apart from
 * `trigger.ts` so the terminal, which only encodes and signs, never ships zod (S23 gate, F-S23-08).
 */
import { z } from "zod";
import { addressSchema, bytes32Schema } from "../schemas/primitives";
import type { ExitTriggerWire } from "./trigger";

const uintText = z.string().regex(/^\d{1,78}$/);
const optUintText = uintText.nullable();

export const exitTriggerWireSchema: z.ZodType<ExitTriggerWire> = z.object({
  owner: addressSchema,
  vault: addressSchema,
  chainId: z.number().int().positive(),
  market: bytes32Schema,
  side: z.enum(["up", "down"]),
  grantId: uintText,
  takeProfitBase: optUintText,
  stopLossBase: optUintText,
  trailBps: z.number().int().nullable(),
  trailStopE8: optUintText,
  nonce: uintText,
  expiresAtSec: z.number().int().positive(),
});

export const exitTriggerRequestSchema = z.object({ trigger: exitTriggerWireSchema, signature: z.string().regex(/^0x[0-9a-fA-F]+$/).max(2_000) });
