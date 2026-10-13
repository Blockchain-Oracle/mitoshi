"use client";
// One key on the trust surface (D-053), on Owarine's key details (R4-11, D-227; ported from Owarine 90a91d71:web/src/
// features/session/SessionDetail.tsx and SessionDetails.module.css): the limits as tiles (Left today · Limit · Resets ·
// Expires), the details as rows (Key · Added · Last used, each a short link to its transaction), Revoke full width —
// the relay pays for it — and the spend history behind one row.
import type { KeyState } from "@cwf/markets";
import { keyStatus } from "@cwf/markets/key-status";
import { shortHex } from "@cwf/core/units";
import { txUrl, type Network } from "@cwf/core";
import type { ReactNode } from "react";
import { PillButton } from "@/components/kit";
import { dollars } from "@/providers/wallet/format";
import { ACCOUNT_PAGE } from "./copy";
import s from "./key-details.module.css";

const K = ACCOUNT_PAGE.keys;
const TOKENS: Record<string, string> = {
  "0x20c0000000000000000000000000000000000000": "pathUSD",
  "0x20c0000000000000000000000000000000000001": "AlphaUSD",
  "0x20c0000000000000000000000000000000000002": "BetaUSD",
  "0x20c0000000000000000000000000000000000003": "ThetaUSD",
};
export const tokenName = (token: string) => TOKENS[token.toLowerCase()] ?? shortHex(token);
export const whenText = (sec: bigint) => new Date(Number(sec) * 1_000).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.limit}>
      <dt className={s.label}>{label}</dt>
      <dd className={s.value}>{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={s.row}>
      <dt className={s.label}>{label}</dt>
      <dd className={s.value}>{children}</dd>
    </div>
  );
}

export function KeyRow({ keyState, nowSec, network, onRevoke, revoking, thisDevice = false }: { keyState: KeyState; nowSec: bigint; network: Network; onRevoke?: () => void; revoking?: boolean; thisDevice?: boolean }) {
  const status = keyStatus(keyState, nowSec);
  const expiry = keyState.live?.expirySec ?? keyState.expirySec;
  const tx = (hash: string) => (
    <a className={s.link} href={txUrl(hash as `0x${string}`, network)} target="_blank" rel="noreferrer">{shortHex(hash)}</a>
  );
  const first = keyState.tokens[0];
  const unlimited = keyState.live?.enforceLimits === false;
  // A revoked key can no longer sign; the precompile reads its expiry as 0, so no expiry is shown for it.
  const expiryText = status === "revoked" || expiry === null ? "—" : expiry === 0n ? K.neverExpires : whenText(expiry);
  return (
    <li className={s.key}>
      <div className={s.head}>
        <div className={s.title}>
          <span className="type-body-strong text-ink">{keyState.admin ? K.kind.admin : thisDevice ? K.thisDevice : K.kind.key}</span>
          {keyState.signatureType !== null ? <span className="type-caption text-ink-secondary">{K.sig[keyState.signatureType] ?? `type ${keyState.signatureType}`}</span> : null}
        </div>
        <span className={s.pill} data-active={status === "active" ? "" : undefined}>{K.status[status]}</span>
      </div>
      {status === "active" ? (
        <dl className={s.limits}>
          <Tile label={K.tiles.left}>{unlimited ? K.noLimit : first ? `${dollars(first.remaining)}` : "—"}</Tile>
          <Tile label={K.tiles.limit}>{unlimited ? "—" : first ? `${dollars(first.limit)} ${tokenName(first.token)}` : "—"}</Tile>
          <Tile label={K.tiles.resets}>{first?.periodEndSec && first.periodEndSec > 0n ? whenText(first.periodEndSec) : "—"}</Tile>
          <Tile label={K.tiles.expires}>{expiryText}</Tile>
        </dl>
      ) : null}
      <dl className={s.details}>
        <Row label={K.rows.key}>{shortHex(keyState.keyId)}</Row>
        {keyState.authorized ? <Row label={K.rows.added}>{tx(keyState.authorized.txHash)}</Row> : null}
        <Row label={K.rows.lastUsed}>{keyState.lastUsed ? tx(keyState.lastUsed.txHash) : K.neverUsed}</Row>
        {keyState.revoked ? <Row label={K.rows.revoked}>{tx(keyState.revoked.txHash)}</Row> : null}
        {thisDevice && status === "active" && first ? <Row label={K.tiles.limit}>{K.approvalsNote(dollars(first.limit))}</Row> : null}
      </dl>
      {keyState.uses.length > 0 ? (
        <details className={s.history}>
          <summary>{K.historyRow(keyState.uses.length)}</summary>
          <ol>
            {keyState.uses.map((u) => (
              <li key={`${u.txHash}-${u.token ?? ""}`}>
                <span className="numbers text-ink">{u.amount === null ? "—" : `${dollars(u.amount)} ${u.token ? tokenName(u.token) : ""}`}</span>
                {tx(u.txHash)}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {status === "active" && onRevoke ? (
        <PillButton tone="ghost" block onClick={onRevoke} disabled={revoking}>
          {revoking ? K.revokingAll : K.revoke}
        </PillButton>
      ) : null}
    </li>
  );
}
