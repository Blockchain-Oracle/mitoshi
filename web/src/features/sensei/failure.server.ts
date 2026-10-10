import "server-only";
// How a failed question reads (S13 step 8; Agari 03b30ab's route, as a module so the route exports only handlers).
import { APICallError, RetryError } from "ai";
import { SENSEI_ERRORS } from "./prompt";

/** The upstream status, whichever provider failed: structural, so a swapped provider needs no new branch. */
function statusOf(error: unknown): number | null {
  const e = RetryError.isInstance(error) ? (error.lastError ?? error) : error;
  if (APICallError.isInstance(e)) return e.statusCode ?? null;
  const code = (e as { statusCode?: unknown })?.statusCode;
  if (typeof code === "number") return code;
  const name = (e as { name?: unknown })?.name;
  return typeof name === "string" && /authentication|unauthor/i.test(name) ? 401 : null;
}

const outOfCredits = (error: unknown): boolean => {
  const e = RetryError.isInstance(error) ? (error.lastError ?? error) : error;
  return APICallError.isInstance(e) && e.statusCode === 429 && /insufficient_quota|credit_balance/.test(e.responseBody ?? "");
};

/** One failure in Sensei's words: a credential problem says so; a busy provider asks for a moment. */
export function failureText(error: unknown, provider: string): string {
  const status = statusOf(error);
  if (status === 401 || status === 403) return SENSEI_ERRORS.badKey(provider);
  if (outOfCredits(error)) return SENSEI_ERRORS.noCredits(provider);
  if (status === 429 || status === 529) return SENSEI_ERRORS.rateLimited;
  if (status !== null) return SENSEI_ERRORS.upstream(status);
  return SENSEI_ERRORS.unreachable;
}

