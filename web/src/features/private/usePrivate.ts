"use client";
/**
 * The private route's client half (Ported from Masayume 68f7a09:web/src/features/private/{usePrivateStatus,
 * usePrivateOpen,usePrivateCashout,usePrivateWrites}.ts): the desk's status, the owner's budget and claims, the open —
 * a fresh 32-byte secret committed in the one text the passkey signs (D-171), then the desk does the rest — the resume
 * of a pending one (from the server's copy, never re-signed), the cash-out, and the owner's own budget writes on the tx
 * lane. Claims live with the account (`/api/private/claims`), not in this browser.
 */
import { type Address, type Hex, type MarketId, type Side, type TxIntent } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { privateOpenText, type PrivateCashoutResult, type PrivateOpenRequest, type PrivateOpenResult, type PrivateStatus, type PrivateTicket } from "@cwf/core/private";
import { getPrivateBudget, secretCommitment } from "@cwf/markets/private";
import { invalidateAfterWrite, useReadingQuery, useSubmitter } from "@cwf/markets/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { notifyReceipt, type WriteReceipt } from "@/features/receipts/write-receipt";
import { notify } from "@/lib/toast";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";

export const privateKeys = { all: ["cwf", "private"] as const };

export interface ClaimRow {
  slotId: string;
  status: "pending" | "open" | "refused" | "credited";
  ticket: PrivateTicket | null;
  result: Record<string, unknown> | null;
  pending: { marketId: string; side: string; stakeBase: string } | null;
  createdAtMs: number;
  updatedAtMs: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !body) throw new Error(body?.error ?? `the private route answered ${res.status}`);
  return body;
}

export function usePrivateStatus() {
  return useQuery({ queryKey: [...privateKeys.all, "status"], queryFn: async () => json<PrivateStatus>(await fetch("/api/private/status", { cache: "no-store" })), staleTime: 30_000, retry: 1 });
}

export function usePrivateBudget(owner: Address | null) {
  return useReadingQuery([...privateKeys.all, "budget", owner ?? ""], () => getPrivateBudget(owner!), { enabled: owner !== null, pollMs: 15_000 });
}

export function usePrivateClaims(owner: Address | null) {
  return useQuery({ queryKey: [...privateKeys.all, "claims", owner ?? ""], queryFn: async () => (await json<{ claims: ClaimRow[] }>(await fetch("/api/private/claims", { cache: "no-store" }))).claims, enabled: owner !== null, refetchInterval: 20_000 });
}

function randomSecret(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return `0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}` as Hex;
}

export interface OpenInput {
  marketId: MarketId;
  asset: string;
  intervalSec: number;
  expirySec: number;
  side: Side;
  stakeBase: bigint;
  minQuantityRaw: bigint;
  contract: Address;
  chainId: number;
}

/** The open, the resume, the cash-out and the budget writes, with one refresh after each. */
export function usePrivateActions(owner: Address | null) {
  const { signMessage } = useWalletShell();
  const submitter = useSubmitter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: privateKeys.all });
    if (owner) await invalidateAfterWrite(queryClient, { wallet: owner });
  }, [queryClient, owner]);

  const post = useCallback(async (body: unknown) => json<PrivateOpenResult>(await fetch("/api/private/open", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })), []);

  const open = useCallback(
    async (i: OpenInput): Promise<PrivateOpenResult> => {
      if (!owner) throw new Error("sign in first");
      setBusy("sign");
      try {
        const secret = randomSecret();
        const issuedAtMs = Date.now();
        const text = privateOpenText({ owner, contract: i.contract, chainId: i.chainId, marketId: i.marketId, asset: i.asset, intervalSec: i.intervalSec, expirySec: i.expirySec, side: i.side, stakeBase: i.stakeBase, issuedAtMs, commitment: secretCommitment(secret) });
        const signature = await signMessage(text);
        setBusy("open");
        const request: PrivateOpenRequest = { owner, marketId: i.marketId, side: i.side, stakeBase: i.stakeBase.toString(), minQuantityRaw: i.minQuantityRaw.toString(), issuedAtMs, signature, secret };
        return await post(request);
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [owner, signMessage, post, refresh],
  );

  const resume = useCallback(
    async (slotId: string): Promise<PrivateOpenResult | null> => {
      setBusy(`resume:${slotId}`);
      try {
        return await post({ resume: slotId });
      } catch (error) {
        notify.warning(error instanceof Error ? error.message : String(error));
        return null;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [post, refresh],
  );

  const cashOut = useCallback(
    async (ticket: PrivateTicket): Promise<PrivateCashoutResult | null> => {
      setBusy(`cashout:${ticket.claim.slotId}`);
      try {
        const res = await fetch("/api/private/cashout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claim: ticket.claim, signature: ticket.signature }) });
        return await json<PrivateCashoutResult>(res);
      } catch (error) {
        notify.warning(error instanceof Error ? error.message : String(error));
        return null;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [refresh],
  );

  /**
   * The owner's own budget writes: a top-up (and its allowance) is self-paid; withdraw and revoke are sponsored (D-177).
   * With a receipt, the confirmation is the toast with its Receipt action (R4-4, D-227; critic gap 21).
   */
  const write = useCallback(
    async (key: string, intent: TxIntent, ok: string, receipt?: Omit<WriteReceipt, "txHash" | "atMs">): Promise<boolean> => {
      if (!submitter) return false;
      setBusy(key);
      try {
        const r = await submitter.submitTx(intent);
        if (r.status === "confirmed") {
          if (receipt) notifyReceipt({ ...receipt, txHash: r.txHash, atMs: Date.now() });
          else notify.neutral(ok);
          return true;
        }
        const c = diagnosisCopy(r.diagnosis.kind);
        notify.warning(c.headline, c.body);
        return false;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [submitter, refresh],
  );

  return { busy, open, resume, cashOut, write };
}
