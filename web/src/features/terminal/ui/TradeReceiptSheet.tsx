"use client";
// The filled tap's receipt sheet (R4-13a, D-227; critic portPlan step 5): the cream TxReceipt — what was staked, the
// Window, the contracts, what it wins if it lands, the transaction on Tempo's explorer — and, when a key signed it, the
// KeyUsedReceipt line with that key's live terms. The Trading Balance key: what is left of today's cap from its vault
// grant, and the grant's expiry. The wallet's access key: what the chain's AccountKeychain says it may still spend this
// period (`useKeyRemaining`, the same read the terminal caps a tap by), against the daily limit and expiry it was
// authorized with on this device. A figure not read yet is left out, never guessed.
import type { Address } from "@cwf/core";
import { formatCadence } from "@cwf/core/copy";
import { formatBaseUnits, formatUtc, secToMs } from "@cwf/core/units";
import { useKeyRemaining, useSigner } from "@cwf/markets/react";
import { KeyUsedReceipt, TxReceipt } from "@/components/tx";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { useSessionView } from "@/features/session";
import { leftNowBase } from "@/features/session/caps";
import { webEnv } from "@/lib/env";
import { TEMPO_CHAIN_ID } from "@/providers/wallet/chain-id";
import { readWalletKey } from "@/providers/wallet/wallet-key-store";
import { money } from "../format";
import { RECEIPT, useTradeReceipt } from "../receipt";

const utc = (sec: number) => formatUtc(secToMs(sec), { withSeconds: false, withDate: true });

/** The Trading Balance's session key: what it can still spend now — today's headroom under the vault grant's daily cap,
 *  bounded by the grant's budget, the rule the key's own chip uses (`leftNowBase`) — against that cap, and its expiry. */
function SessionKeyLine() {
  const session = useSessionView();
  const grant = session.grant;
  const cap = grant?.caps.maxDailySpendBase ?? null;
  const left = grant ? leftNowBase(grant, Math.floor(Date.now() / 1000)) : null;
  return (
    <KeyUsedReceipt
      keyLabel={RECEIPT.keys.session}
      leftText={left !== null ? money(left) : null}
      limitText={cap !== null ? money(cap) : null}
      expiresText={grant ? utc(grant.expiresAtSec) : null}
    />
  );
}

/** This wallet's access key: the keychain's remaining limit, read from the chain, against the terms it was armed with. */
function WalletKeyLine({ address }: { address: Address | null }) {
  const armed = address ? readWalletKey(TEMPO_CHAIN_ID, address) : null;
  const left = useKeyRemaining(address, armed?.keyId ?? null);
  return (
    <KeyUsedReceipt
      keyLabel={RECEIPT.keys.wallet}
      leftText={left?.ok ? money(left.value.remaining) : null}
      limitText={armed ? money(armed.limitBase) : null}
      expiresText={armed ? utc(armed.expirySec) : null}
    />
  );
}

export function TradeReceiptSheet() {
  const [r, close] = useTradeReceipt();
  const { address } = useSigner();
  if (!r) return null;
  return (
    <SlideOver open onOpenChange={(o) => { if (!o) close(); }}>
      <SlideOverContent title={RECEIPT.action}>
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
          {r.key === "session" ? <SessionKeyLine /> : r.key === "wallet" ? <WalletKeyLine address={address} /> : null}
        </div>
      </SlideOverContent>
    </SlideOver>
  );
}
