// What a passkey ceremony's failure means (round 7: the owner's passkey errors "look bad" — a generic "Something went
// sideways" with raw technical details). WebAuthn reports the few cases a person can act on as DOMException names; the
// accounts SDK and wagmi wrap them, so the cause chain is walked. A cancel, a timeout and "no passkey on this phone"
// are one NotAllowedError by design (browsers don't say which), so those stay a quiet return to the sheet.
export type PasskeyFailure = "exists" | "unsupported" | "blocked";

function texts(error: unknown): string[] {
  const out: string[] = [];
  let e: unknown = error;
  for (let i = 0; i < 6 && e; i++) {
    out.push(e instanceof Error ? `${e.name} ${e.message}` : String(e));
    e = e instanceof Error ? (e as Error & { cause?: unknown }).cause : null;
  }
  return out;
}

export function passkeyFailure(error: unknown): PasskeyFailure | null {
  const all = texts(error).join(" | ");
  if (/InvalidStateError|already (been )?registered|credential.*exclude/i.test(all)) return "exists";
  if (/NotSupportedError|not supported|PublicKeyCredential is not/i.test(all)) return "unsupported";
  if (/SecurityError|relying party|rp ?id|invalid domain|not a valid domain/i.test(all)) return "blocked";
  return null;
}
