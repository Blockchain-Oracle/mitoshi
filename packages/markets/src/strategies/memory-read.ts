/**
 * The Memory Market's paid read, in the browser (S9.9b): mppx 0.10's documented wagmi pattern (examples/charge-wagmi:
 * `tempo.charge({ mode: 'push', getClient: () => getConnectorClient(config) })`). The route answers 402 with a
 * challenge; the wallet signs and sends one pathUSD transfer to the creator; mppx retries with its hash and returns the
 * read. mppx refuses a challenge naming any other recipient or chain. The creator's TIP-403 receive policy is asked
 * first: a transfer it blocks would leave the wallet and never reach the creator. mppx loads on the tap, not with the
 * desk.
 */
import type { Address, Client } from "viem";
import { PATH_USD } from "../path-usd";
import { readReceiverAccepts } from "./read";

export type PaidMemoryRead = { kind: "read"; title: string; body: string } | { kind: "refused"; why: "receiver-blocks" | "not-offered" | "failed" };

export async function buyMemoryRead(input: { url: string; creator: Address; payer: Address; chainId: number; getClient: () => Promise<Client> }): Promise<PaidMemoryRead> {
  if (!(await readReceiverAccepts(PATH_USD, input.payer, input.creator).catch(() => false))) return { kind: "refused", why: "receiver-blocks" };
  const { Mppx, tempo } = await import("mppx/client");
  const mppx = Mppx.create({
    polyfill: false,
    maxPaymentRetries: 1,
    methods: [tempo.charge({ mode: "push", expectedChainId: input.chainId, expectedRecipients: [input.creator], getClient: input.getClient })],
  });
  const res = await mppx.fetch(input.url, { cache: "no-store" });
  if (res.status === 404) return { kind: "refused", why: "not-offered" };
  if (!res.ok) return { kind: "refused", why: "failed" };
  const read = (await res.json()) as { title: string; body: string };
  return { kind: "read", title: read.title, body: read.body };
}
