// Ported from Masayume 68f7a09:packages/markets/src/errors/error-map.ts — the Somnia SDK error classes become viem's
// error walk, and the Tempo refusals join the one vocabulary (M-13): access-key limits and scopes, revoked keys, fee
// token, sponsorship, receive policy (plan C.2.4 `errors/*`). viem's errors are recognised by their declared `name`
// and shape, not `instanceof`, so this module (in every page via `useReadingQuery`) never loads viem (§3.1).
import { diagnosis, type Diagnosis, type DiagnosisKind } from "@cwf/core";
import { ReadingError } from "./reading-error";

const USER_REJECTED_CODE = 4001;

/** Revert names (engine custom errors, Tempo precompiles, TIP-20), mapped to the one diagnosis vocabulary (AD-13). */
const REVERT_KINDS: Record<string, DiagnosisKind> = {
  InsufficientBalance: "insufficient-collateral",
  ERC20InsufficientBalance: "insufficient-collateral",
  InsufficientAllowance: "insufficient-allowance",
  ERC20InsufficientAllowance: "insufficient-allowance",
  // TIP-1011 access keys (AccountKeychain).
  SpendingLimitExceeded: "spending-limit",
  CallNotAllowed: "call-not-allowed",
  StaticCallNotAllowed: "call-not-allowed",
  KeyAlreadyRevoked: "key-revoked",
  KeyRevoked: "key-revoked",
  KeyExpired: "key-revoked",
  KeyNotFound: "key-revoked",
  // Fees: Tempo has no gas token; an unsponsored fee is paid in the fee token.
  InsufficientFeeTokenBalance: "fee-token",
  InvalidFeeToken: "fee-token",
  // TIP-403 / receive policies.
  PolicyForbids: "receive-policy",
  TransferBlocked: "receive-policy",
  RecipientNotAllowed: "receive-policy",
  // Engine (docs/specs/engine.md A.2): names follow Agari's/Masayume's where the semantics carried.
  PostOnlyWouldCross: "post-only-would-cross",
  OrderAlreadyExpired: "order-expired",
  ExpiryAfterLock: "order-expired",
  InvalidPrice: "invalid-price",
  BelowMinLots: "below-min-quantity",
  InvalidQuantity: "below-min-quantity",
  MarketNotTrading: "market-not-trading",
  PreOpenTakerRefused: "market-not-trading",
  OpenPrintMissing: "market-not-trading",
  MarketAlreadyTerminal: "market-not-trading",
  MarketStatusRefused: "market-not-trading",
  MarketNotTerminal: "not-settled",
  NothingToRedeem: "already-claimed",
  // The book moved between quote and fill: nothing crossed at the protective limit (the lane re-quotes).
  ImmediateOrCancelNoFill: "requote",
  FillOrKillNotFillable: "no-liquidity",
  InsufficientOutcome: "insufficient-collateral",
  InsufficientCredit: "insufficient-collateral",
  // The engine pre-checks the payee's TIP-403 receive policy (engine A.2 `_pay`).
  ReceivePolicyBlocked: "receive-policy",
  // StrategyRegistry (S9, A.4.8): a fee raised since it was read is a re-quote; a grant the registry can't accept is
  // the grant's refusal; metadata is the root key's to write (D-019) — an access key may not make that call.
  FeeAboveMax: "requote",
  FeeRecipientBlocked: "receive-policy",
  CapsOutsideEnvelope: "grant-refused",
  OutsideEnvelopeMarket: "grant-refused",
  WrongActor: "grant-refused",
  WrongGrantKind: "grant-refused",
  GrantNotLive: "grant-refused",
  NotGrantOwner: "grant-refused",
  NoSuchGrant: "grant-refused",
  MetadataNeedsRootKey: "call-not-allowed",
};

const MESSAGE_KINDS: ReadonlyArray<readonly [RegExp, DiagnosisKind]> = [
  [/user (rejected|denied|cancel)|NotAllowedError|The operation either timed out or was not allowed/i, "user-rejected"],
  [/chain mismatch|wrong (chain|network)|does not match the target chain/i, "wrong-chain"],
  [/sponsorship rejected/i, "sponsor-refused"],
  [/unavailable for legal reasons|region restricted/i, "region-restricted"],
  [/insufficient fee token|fee token/i, "fee-token"],
  // The public RPC's per-IP limit (D-134): a refused request, never an accepted one — the node never saw the write.
  [/exceeds defined limit|rate limited|too many requests/i, "rate-limited"],
];

type Named = { name?: unknown; shortMessage?: unknown; message?: unknown; data?: { errorName?: unknown } };
const nameOf = (e: unknown): string | undefined => (typeof e === "object" && e !== null && typeof (e as Named).name === "string" ? ((e as Named).name as string) : undefined);

/** The short message plus the node's own words (viem's `details`): an RPC error's short message is generic
 *  ("An internal error was received.") while `details` names the refusal (`KeyAlreadyRevoked`, X20). */
function messageOf(error: unknown): string {
  const short = typeof error === "object" && error !== null ? (error as Named).shortMessage : undefined;
  const details = typeof error === "object" && error !== null ? (error as { details?: unknown }).details : undefined;
  if (typeof short === "string" && short) return typeof details === "string" && details && !short.includes(details) ? `${short} ${details}` : short;
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  let current: unknown = error;
  while (current && chain.length < 10) {
    chain.push(current);
    current = typeof current === "object" && current !== null && "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }
  return chain;
}

function isUserRejection(error: unknown): boolean {
  return causeChain(error).some(
    (e) => nameOf(e) === "UserRejectedRequestError" || (typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === USER_REJECTED_CODE),
  );
}

/** The custom error name a revert carries, wherever in the cause chain viem put it. */
export function revertNameOf(error: unknown): string | undefined {
  for (const e of causeChain(error)) {
    const errorName = nameOf(e) === "ContractFunctionRevertedError" ? (e as Named).data?.errorName : undefined;
    if (typeof errorName === "string" && errorName) return errorName;
  }
  const match = /reverted with the following reason:\s*\n?\s*([A-Za-z0-9_]+)\(/.exec(messageOf(error));
  return match?.[1];
}

function kindFromMessage(message: string): DiagnosisKind | null {
  for (const [pattern, kind] of MESSAGE_KINDS) if (pattern.test(message)) return kind;
  for (const [name, kind] of Object.entries(REVERT_KINDS)) if (new RegExp(`\\b${name}\\b`).test(message)) return kind;
  return null;
}

function isTransport(error: unknown): boolean {
  const transport = new Set(["HttpRequestError", "WebSocketRequestError", "TimeoutError", "SocketClosedError"]);
  return causeChain(error).some((e) => transport.has(nameOf(e) ?? ""));
}

/** The diagnosis kind for a revert name, or null when the name is not in the vocabulary. */
export function revertKind(errorName: string): DiagnosisKind | null {
  return REVERT_KINDS[errorName] ?? null;
}

/** Translates any provider/viem failure into a typed diagnosis; the raw message survives as `technical`. */
export function diagnose(error: unknown): Diagnosis {
  if (error instanceof ReadingError) return error.diagnosis;
  const technical = messageOf(error);
  if (isUserRejection(error)) return diagnosis("user-rejected", technical);
  const errorName = revertNameOf(error);
  if (errorName) {
    const kind = REVERT_KINDS[errorName] ?? kindFromMessage(technical) ?? "contract-revert";
    return diagnosis(kind, technical, { errorName });
  }
  const fromMessage = kindFromMessage(technical);
  if (fromMessage) return diagnosis(fromMessage, technical);
  if (isTransport(error)) return diagnosis("rpc-down", technical);
  return diagnosis("unknown", technical);
}
