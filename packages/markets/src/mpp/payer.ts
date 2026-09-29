/**
 * The MPP payer (plan C.5.3): an access key signing for the MPP root (`Account.fromSecp256k1(key, { access: root })`),
 * paying 402 challenges through mppx without polyfilling `fetch`, under software caps, with every payment recorded by
 * the receipt hook. Two shapes:
 *  - `createMppPayer().fetch` — per-request **charge** (one TIP-20 transfer, on-chain reference), preferred (D-033);
 *    for model calls (`@cwf/brain` `via: 'mpp'`) and paid data.
 *  - `createMppSession().fetch` — **session** (TIP-1034 channel + vouchers) for services that offer only that, e.g.
 *    the Tempo Indexer API (X10). One channel is reused; `close()` settles it.
 * Server-only: holds a key. Docs: tempo docs guide/machine-payments/{client,pay-as-you-go}; mppx `Mppx.create`,
 * `tempo.charge`, `tempo.session.manager`, `Receipt`.
 */
import type { Challenge } from "mppx";
import { Mppx, tempo as tempoMethods } from "mppx/client";
import { createClient, getAddress, http, type Address, type Client, type Hex } from "viem";
import { Account } from "viem/tempo";
import type { Network } from "@cwf/core";
import { NETWORKS } from "@cwf/core";
import { tempoChain } from "../chains";
import { offerOf, type MppOffer } from "./challenges";
import { rankOffers, SpendLedger, type MppCaps } from "./caps";
import { MPP_ESCROW } from "./access-key";
import { deliver, readPaymentReceipt, receiptRow, type ReceiptSink } from "./receipts";

export interface MppPayerConfig {
  network: Network;
  /** The access key's private key (`MPP_PAYER_PRIVATE_KEY`). */
  privateKey: Hex;
  /** The account the key signs for (`MPP_ROOT_ADDRESS`); omit only for a plain key paying from itself. */
  root?: Address;
  caps: MppCaps;
  sink?: ReceiptSink;
  rpcUrl?: string;
  /** Wrapped fetch (tests, proxies). Defaults to the global. */
  fetch?: typeof fetch;
  onSinkError?: (error: unknown) => void;
}

/** The payer account: an access key for `root`, or the key's own account. */
export function mppPayerAccount(privateKey: Hex, root?: Address) {
  return root ? Account.fromSecp256k1(privateKey, { access: getAddress(root) }) : Account.fromSecp256k1(privateKey);
}

function chainClient(network: Network, rpcUrl?: string): Client {
  return createClient({ chain: tempoChain(network), transport: http(rpcUrl) });
}

/** Default caps for a network: its own chain, pathUSD (+ USDC.e on mainnet), charge before session. */
export function defaultMppCaps(network: Network, currencies: MppCaps["currencies"]): MppCaps {
  return { chainIds: [NETWORKS[network]], currencies, intents: ["charge", "session"] };
}

export class MppRefusedError extends Error {
  override readonly name = "MppRefusedError";
  constructor(readonly url: string, readonly reasons: string[]) {
    super(`MPP payment refused for ${url}: ${reasons.join("; ") || "no payable offer"}`);
  }
}

export interface MppPayer {
  /** Payment-aware fetch: pays a 402 once (charge) within the caps; throws `MppRefusedError` when nothing is payable. */
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  account: ReturnType<typeof mppPayerAccount>;
  ledger: SpendLedger;
}

/** Charge-intent payer (model calls, paid data). */
export function createMppPayer(config: MppPayerConfig): MppPayer {
  const account = mppPayerAccount(config.privateKey, config.root);
  const client = chainClient(config.network, config.rpcUrl);
  const ledger = new SpendLedger(config.caps);
  const chainId = NETWORKS[config.network];
  const mppx = Mppx.create({
    polyfill: false,
    ...(config.fetch ? { fetch: config.fetch } : {}),
    maxPaymentRetries: 1,
    methods: [tempoMethods.charge({ account, getClient: () => client, expectedChainId: chainId })],
  });

  async function pay(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const url = String(input);
    let chosen: { offer: MppOffer; release: () => void } | null = null;
    const reasons: string[] = [];
    const response = await mppx.fetch(url, {
      ...init,
      orderChallenges: (candidates: readonly { challenge: Challenge.Challenge }[]) => {
        const offers = candidates.map((c) => offerOf(c.challenge));
        const { allowed, refused } = rankOffers(offers, config.caps);
        reasons.push(...refused.map((r) => `${r.offer.intent}/${r.offer.currency}: ${r.reason}`));
        for (const offer of allowed) {
          const reservation = ledger.reserve(offer);
          if ("refused" in reservation) {
            reasons.push(reservation.refused);
            continue;
          }
          chosen = { offer, release: reservation.release };
          return candidates.filter((c) => c.challenge.id === offer.id);
        }
        return [];
      },
    } as RequestInit);
    const picked = chosen as { offer: MppOffer; release: () => void } | null;
    if (!picked) {
      if (response.status === 402) throw new MppRefusedError(url, reasons);
      return response; // free response: nothing was paid
    }
    const receipt = response.ok ? readPaymentReceipt(response) : null;
    if (!receipt) picked.release();
    const failure = receipt ? undefined : `status ${response.status} without a Payment-Receipt`;
    await deliver(config.sink, receiptRow({ url, offer: picked.offer, payer: account.address, receipt, ...(failure ? { failure } : {}) }), config.onSinkError);
    return response;
  }

  return { fetch: pay, account, ledger };
}

export interface MppSessionConfig extends MppPayerConfig {
  /** Max channel deposit in base units (caps the server's suggested deposit and automatic top-ups). */
  maxDepositBase: bigint;
}

export interface MppSession {
  fetch: (input: string | URL, init?: RequestInit) => Promise<Response>;
  close: () => Promise<{ reference: string | null; txHash: string | null } | undefined>;
  readonly channelId: string | undefined;
  account: ReturnType<typeof mppPayerAccount>;
  ledger: SpendLedger;
}

const toHuman = (base: bigint, decimals = 6) => {
  const s = base.toString().padStart(decimals + 1, "0");
  return `${s.slice(0, -decimals)}.${s.slice(-decimals)}`;
};

/** Session-intent payer: one reusable TIP-1034 channel on the canonical escrow; every paid response is recorded. */
export function createMppSession(config: MppSessionConfig): MppSession {
  const account = mppPayerAccount(config.privateKey, config.root);
  const client = chainClient(config.network, config.rpcUrl);
  const chainId = NETWORKS[config.network];
  const ledger = new SpendLedger(config.caps);
  const manager = tempoMethods.session.manager({
    account,
    client,
    allowedChainIds: [chainId],
    escrow: MPP_ESCROW,
    maxDeposit: toHuman(config.maxDepositBase),
    ...(config.fetch ? { fetch: config.fetch } : {}),
  });

  async function pay(input: string | URL, init: RequestInit = {}): Promise<Response> {
    const url = String(input);
    const response = await manager.fetch(url, init);
    const challenge = response.challenge;
    if (!challenge) return response; // served without payment
    const offer = offerOf(challenge as never);
    // The channel deposit (≤ maxDepositBase) bounds what vouchers can ever pay; these checks stop reuse the moment the
    // server's price or terms leave the caps, and close the channel so the unspent deposit returns.
    const { refused } = rankOffers([offer], config.caps);
    const reservation = refused.length ? null : ledger.reserve(offer);
    if (refused.length || !reservation || "refused" in reservation) {
      await manager.close().catch(() => undefined);
      throw new MppRefusedError(url, refused.length ? refused.map((r) => r.reason) : [reservation && "refused" in reservation ? reservation.refused : "refused"]);
    }
    const receipt = response.receipt ? ({ ...response.receipt } as never) : null;
    const failure = receipt ? undefined : `status ${response.status} without a session receipt`;
    await deliver(config.sink, receiptRow({ url, offer, payer: account.address, receipt, ...(failure ? { failure } : {}) }), config.onSinkError);
    return response;
  }

  return {
    fetch: pay,
    async close() {
      const r = await manager.close();
      return r ? { reference: r.reference ?? null, txHash: r.txHash ?? null } : undefined;
    },
    get channelId() {
      return manager.channelId;
    },
    account,
    ledger,
  };
}
