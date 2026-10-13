"use client";
// The filled tap's receipt sheet (R4-13a, D-227; critic portPlan step 5): the cream TxReceipt — what was staked, the
// Window, the contracts, what it wins if it lands, the transaction on Tempo's explorer — and, when a key signed it, the
// KeyUsedReceipt line. The Trading Balance key's line carries its live grant: what is left of today's cap and when it
// expires. The wallet's access key names itself only (its spend is the chain keychain's, which this screen doesn't read).
import { formatCadence } from "@cwf/core/copy";
import { formatBaseUnits, formatUtc, secToMs } from "@cwf/core/units";
import { KeyUsedReceipt, TxReceipt } from "@/components/tx";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { useSessionView } from "@/features/session";
import { webEnv } from "@/lib/env";
import { money } from "../format";
import { RECEIPT, useTradeReceipt } from "../receipt";

const DAY_SEC = 86_400;

export function TradeReceiptSheet() {
  const [r, close] = useTradeReceipt();
  const session = useSessionView();
  if (!r) return null;
  const grant = r.key === "session" ? session.grant : null;
  const nowSec = Math.floor(Date.now() / 1000);
  const spent = grant && grant.spentDay === Math.floor(nowSec / DAY_SEC) ? grant.spentTodayBase : 0n;
  const cap = grant?.caps.maxDailySpendBase ?? null;
  const left = grant && cap !== null ? (cap > spent ? cap - spent : 0n) : null;
  return (
    <SlideOver open onOpenChange={(o) => { if (!o) close(); }}>
      <SlideOverContent title={RECEIPT.title}>
        <div className="flex flex-col gap-3">
          <TxReceipt
            title={RECEIPT.title}
            figure={money(r.costBase, false, r.decimals)}
            figureLabel={RECEIPT.figureLabel}
            atMs={r.atMs}
            txHash={r.txHash}
            network={webEnv.markets.network}
            rows={[
              { label: RECEIPT.window, value: `${r.asset} · ${formatCadence(r.intervalSec)} · ${r.side.toUpperCase()}` },
              { label: RECEIPT.contracts, value: formatBaseUnits(r.contractsRaw, r.decimals, { minDp: 0, maxDp: 2 }) },
              { label: RECEIPT.toWin, value: money(r.contractsRaw, false, r.decimals) },
            ]}
          />
          {r.key ? (
            <KeyUsedReceipt
              keyLabel={RECEIPT.keys[r.key]}
              leftText={left !== null ? money(left) : null}
              limitText={cap !== null ? money(cap) : null}
              expiresText={grant ? formatUtc(secToMs(grant.expiresAtSec), { withSeconds: false, withDate: true }) : null}
            />
          ) : null}
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
