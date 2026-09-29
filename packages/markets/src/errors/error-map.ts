// Ported from Masayume 68f7a09:packages/markets/src/errors/error-map.ts — the Somnia SDK error classes become viem's
// error walk, and the Tempo refusals join the one vocabulary (M-13): access-key limits and scopes, revoked keys, fee
// token, sponsorship, receive policy (plan C.2.4 `errors/*`).
import { BaseError, ContractFunctionRevertedError, HttpRequestError, TimeoutError, UserRejectedRequestError, WebSocketRequestError } from "viem";
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
  OrderExpiryBeyondLock: "order-expired",
  InvalidPrice: "invalid-price",
  BelowMinLots: "below-min-quantity",
  MarketNotTrading: "market-not-trading",
  MarketNotResolved: "not-settled",
  NothingToRedeem: "already-claimed",
};

const MESSAGE_KINDS: ReadonlyArray<readonly [RegExp, DiagnosisKind]> = [
  [/user (rejected|denied|cancel)|NotAllowedError|The operation either timed out or was not allowed/i, "user-rejected"],
  [/chain mismatch|wrong (chain|network)|does not match the target chain/i, "wrong-chain"],
  [/sponsorship rejected/i, "sponsor-refused"],
  [/unavailable for legal reasons|region restricted/i, "region-restricted"],
  [/insufficient fee token|fee token/i, "fee-token"],
];

function messageOf(error: unknown): string {
  if (error instanceof BaseError) return error.shortMessage || error.message;
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
    (e) => e instanceof UserRejectedRequestError || (typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === USER_REJECTED_CODE),
  );
}

/** The custom error name a revert carries, wherever in the cause chain viem put it. */
export function revertNameOf(error: unknown): string | undefined {
  for (const e of causeChain(error)) {
    if (e instanceof ContractFunctionRevertedError && e.data?.errorName) return e.data.errorName;
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
  return causeChain(error).some((e) => e instanceof HttpRequestError || e instanceof WebSocketRequestError || e instanceof TimeoutError);
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
