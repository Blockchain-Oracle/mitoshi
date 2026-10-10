"use client";
// One key on the trust surface (D-053): what it is, whether it can still sign, what it may still spend and when that
// resets, when it was added and last used (each linked to its transaction), and a one-step revoke that our relay pays for.
import type { KeyState } from "@cwf/markets";
import { keyStatus } from "@cwf/markets/key-status";
import { shortHex } from "@cwf/core/units";
import { txUrl, type Network } from "@cwf/core";
import { dollars } from "@/providers/wallet/format";
import { cn } from "@/lib/utils";
import { ACCOUNT_PAGE } from "./copy";

const K = ACCOUNT_PAGE.keys;
const TOKENS: Record<string, string> = {
  "0x20c0000000000000000000000000000000000000": "pathUSD",
  "0x20c0000000000000000000000000000000000001": "AlphaUSD",
  "0x20c0000000000000000000000000000000000002": "BetaUSD",
  "0x20c0000000000000000000000000000000000003": "ThetaUSD",
};
export const tokenName = (token: string) => TOKENS[token.toLowerCase()] ?? shortHex(token);
export const whenText = (sec: bigint) => new Date(Number(sec) * 1_000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function KeyRow({ keyState, nowSec, network, onRevoke, revoking, thisDevice = false }: { keyState: KeyState; nowSec: bigint; network: Network; onRevoke?: () => void; revoking?: boolean; thisDevice?: boolean }) {
  const status = keyStatus(keyState, nowSec);
  const expiry = keyState.live?.expirySec ?? keyState.expirySec;
  const link = (hash: string) => txUrl(hash as `0x${string}`, network);
  return (
    <li className="flex flex-col gap-3 rounded-lg border border-hairline bg-surface-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="type-body-strong text-ink">{keyState.admin ? K.kind.admin : thisDevice ? K.thisDevice : K.kind.key}</span>
          <span className="numbers type-caption text-ink-secondary">
            {shortHex(keyState.keyId)}
            {keyState.signatureType !== null ? ` · ${K.sig[keyState.signatureType] ?? `type ${keyState.signatureType}`}` : ""}
          </span>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 type-label-micro", status === "active" ? "border-border-strong text-ink" : "border-hairline text-ink-secondary")}>{K.status[status]}</span>
      </div>
      <dl className="grid grid-cols-1 gap-1 type-caption text-ink-secondary sm:grid-cols-2">
        {status === "active" ? (
          keyState.tokens.length === 0 ? (
            <div><dt className="sr-only">Limit</dt><dd>{keyState.live?.enforceLimits === false ? K.noLimit : "—"}</dd></div>
          ) : (
            keyState.tokens.map((t) => (
              <div key={t.token}>
                <dt className="sr-only">{tokenName(t.token)} limit</dt>
                <dd className="numbers text-ink">
                  {K.left(dollars(t.remaining), dollars(t.limit), tokenName(t.token))}
                  {t.periodEndSec && t.periodEndSec > 0n ? <span className="text-ink-secondary"> · {K.resets(whenText(t.periodEndSec))}</span> : null}
                </dd>
              </div>
            ))
          )
        ) : null}
        {thisDevice && status === "active" ? <div className="sm:col-span-2"><dd>{K.approvalsNote(dollars(keyState.tokens[0]?.limit ?? null))}</dd></div> : null}
        {/* A revoked key can no longer sign; the precompile reads its expiry as 0, so no expiry line is shown. */}
        {status === "revoked" ? null : <div><dt className="sr-only">Expiry</dt><dd>{expiry === null ? "—" : expiry === 0n ? K.neverExpires : expiry <= nowSec ? K.expired(whenText(expiry)) : K.expires(whenText(expiry))}</dd></div>}
        <div>
          <dt className="inline">{K.lastUsed}: </dt>
          <dd className="inline">{keyState.lastUsed ? <a className="numbers underline decoration-dotted underline-offset-4" href={link(keyState.lastUsed.txHash)} target="_blank" rel="noreferrer">block {keyState.lastUsed.block.toString()}</a> : K.neverUsed}</dd>
        </div>
        {keyState.authorized ? (
          <div><dt className="inline">{K.authorized}: </dt><dd className="inline"><a className="numbers underline decoration-dotted underline-offset-4" href={link(keyState.authorized.txHash)} target="_blank" rel="noreferrer">block {keyState.authorized.block.toString()}</a></dd></div>
        ) : null}
        {keyState.revoked ? (
          <div><dt className="inline">{K.revokedAt}: </dt><dd className="inline"><a className="numbers underline decoration-dotted underline-offset-4" href={link(keyState.revoked.txHash)} target="_blank" rel="noreferrer">block {keyState.revoked.block.toString()}</a></dd></div>
        ) : null}
      </dl>
      {keyState.uses.length > 0 ? (
        <details className="type-caption text-ink-secondary">
          <summary className="min-h-touch cursor-pointer content-center type-body-strong text-ink">{K.history(keyState.uses.length)}</summary>
          <ol className="mt-1 flex flex-col divide-y divide-hairline">
            {keyState.uses.map((u) => (
              <li key={`${u.txHash}-${u.token ?? ""}`} className="flex items-center justify-between gap-3 py-2">
                <span className="numbers text-ink">{u.amount === null ? "—" : `${dollars(u.amount)} ${u.token ? tokenName(u.token) : ""}`}</span>
                <a className="numbers underline decoration-dotted underline-offset-4" href={link(u.txHash)} target="_blank" rel="noreferrer">block {u.block.toString()}</a>
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {status === "active" && onRevoke ? (
        <button type="button" onClick={onRevoke} disabled={revoking} className="min-h-touch self-start rounded-md border border-border-strong px-4 type-body-strong text-ink disabled:opacity-50">
          {revoking ? K.revokingAll : K.revoke}
        </button>
      ) : null}
    </li>
  );
}
