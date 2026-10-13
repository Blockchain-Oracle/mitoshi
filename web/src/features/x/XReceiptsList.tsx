"use client";
// Ported from Owarine 90a91d71:web/src/features/x/{XReceiptsList,receipt-display,useXReceipts}.ts(x) — S11 (D-227): every
// mention the relay handled for the X account signed in here, with what became of it; a refusal says why and links its
// fix; a chain result links its transaction. A requested stake is never shown as spent.
import { formatBaseUnits, txUrl, USD_DECIMALS, X_RECEIPT_STATUSES, xReceiptRecovery, xRefusalCopy, type XReceipt } from "@cwf/core";
import { useQuery } from "@tanstack/react-query";
import { webEnv } from "@/lib/env";
import { shortAddress } from "@/providers/wallet/format";
import { TFX } from "./copy";
import type { XReceiptsFeed } from "./protocol";

const LABEL: Record<XReceipt["status"], string> = { filled: "Filled", submitted: "Received", unknown: "Needs checking", refused: "Not placed", reverted: "Reverted", "nothing-filled": "No fill" };
const HASH = /^0x[0-9a-fA-F]{64}$/;
const usd = (v: string | null | undefined) => (v && /^\d+$/.test(v) ? `$${formatBaseUnits(BigInt(v), USD_DECIMALS, { minDp: 2, maxDp: 2 })}` : null);

export function useXReceipts(signedIn: boolean): XReceiptsFeed | null {
  const q = useQuery({
    queryKey: ["cwf", "x", "receipts"],
    queryFn: async () => {
      const res = await fetch("/api/x/receipts", { cache: "no-store" });
      if (!res.ok) throw new Error(`receipts ${res.status}`);
      return (await res.json()) as XReceiptsFeed;
    },
    enabled: signedIn,
    refetchInterval: 15_000,
  });
  return q.data ?? null;
}

function Row({ r }: { r: XReceipt }) {
  const hash = HASH.test(r.txHash ?? "") ? (r.txHash as `0x${string}`) : null;
  const status = X_RECEIPT_STATUSES.includes(r.status) ? r.status : "unknown";
  const refusal = status === "refused" ? xRefusalCopy(r) : null;
  const fix = status === "refused" ? xReceiptRecovery(r.refusalCode) : null;
  const amount = status === "filled" ? usd(r.bookedCostBase) : usd(r.stakeBase);
  return (
    <li className="xr-row" data-status={status}>
      <span className="xr-status">{r.dryRun ? "Dry run" : refusal?.title ?? LABEL[status]}</span>
      <span className="xr-words">{r.instruction}</span>
      <span className="xr-meta">
        {[r.side?.toUpperCase(), amount ? `${status === "filled" ? "spent" : "asked"} ${amount}` : null].filter(Boolean).join(" · ")}
        {hash ? <> · <a href={txUrl(hash, webEnv.markets.network)} target="_blank" rel="noreferrer">{shortAddress(hash)}</a></> : null}
      </span>
      {refusal && !r.dryRun ? <span className="xr-meta">{refusal.detail}{fix ? <> <a href={fix.href}>{fix.label}</a></> : null}</span> : null}
      {r.dryRun && r.reason ? <span className="xr-meta">{r.reason}</span> : null}
    </li>
  );
}

export function XReceiptsList({ feed, signedIn }: { feed: XReceiptsFeed | null; signedIn: boolean }) {
  return (
    <section aria-label={TFX.receipts.title} className="flex flex-col gap-2">
      <h2 className="type-body-strong text-ink">{TFX.receipts.title}</h2>
      {!signedIn ? <p className="xt-note">{TFX.receipts.signIn}</p> : !feed || feed.receipts.length === 0 ? <p className="xt-note">{TFX.receipts.empty}</p> : (
        <ul className="xr-list">
          {feed.receipts.map((r) => <Row key={r.mentionId} r={r} />)}
        </ul>
      )}
    </section>
  );
}
