/** A JSON-RPC wallet facade. The private testnet reviewer key stays on the server. */
import { tempoChain } from "@cwf/markets";
import { getAddress, numberToHex, type EIP1193Provider } from "viem";
import { createConnector } from "wagmi";

export const REVIEWER_CONNECTOR_ID = "xyz.mitoshi.reviewer";
const CHAIN_ID = tempoChain("testnet").id;

type Session = { address: string | null };

async function session(): Promise<Session> {
  const res = await fetch("/api/reviewer/session", { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) return { address: null };
  return res.json() as Promise<Session>;
}

async function rpc(method: string, params: unknown): Promise<unknown> {
  const res = await fetch("/api/rpc", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }), cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as { result?: unknown; error?: { message?: string } };
  if (!res.ok || json.error) throw new Error(json.error?.message ?? `RPC ${method} failed`);
  return json.result;
}

const provider = {
  async request({ method, params }: { method: string; params?: unknown }) {
    if (method === "eth_chainId") return numberToHex(CHAIN_ID);
    if (method === "eth_accounts" || method === "eth_requestAccounts") {
      const current = await session();
      return current.address ? [getAddress(current.address)] : [];
    }
    if (method === "eth_sendTransaction" || method === "wallet_sendTransaction") {
      const res = await fetch("/api/reviewer/sign", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params }), cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
      if (!res.ok || !json.result) throw new Error(json.error ?? "Reviewer transaction failed");
      return json.result;
    }
    if (!/^(eth_(get[A-Z]|call$|estimateGas$|blockNumber$|feeHistory$|maxPriorityFeePerGas$|gasPrice$|syncing$)|net_version$|web3_clientVersion$|tempo_get[A-Z])/.test(method)) throw new Error("This shared review account cannot perform that request.");
    return rpc(method, params);
  },
  on() { return provider; },
  removeListener() { return provider; },
} as EIP1193Provider;

export function reviewerConnector() {
  return createConnector((config) => ({
    id: REVIEWER_CONNECTOR_ID,
    name: "Mitoshi review",
    type: "reviewer",
    async connect({ withCapabilities } = {}) {
      const current = await session();
      if (!current.address) throw new Error("Enter the Play review code first.");
      const address = getAddress(current.address);
      return { accounts: withCapabilities ? [{ address, capabilities: {} }] : [address], chainId: CHAIN_ID } as never;
    },
    async disconnect() {
      await fetch("/api/reviewer/session", { method: "DELETE", credentials: "same-origin" });
      config.emitter.emit("disconnect");
    },
    async getAccounts() {
      const current = await session();
      return current.address ? [getAddress(current.address)] : [];
    },
    async getChainId() { return CHAIN_ID; },
    async getProvider() { return provider; },
    async isAuthorized() { return Boolean((await session()).address); },
    onAccountsChanged(accounts) {
      config.emitter.emit("change", { accounts: accounts.map((address) => getAddress(address)) });
    },
    onChainChanged() { config.emitter.emit("change", { chainId: CHAIN_ID }); },
    onDisconnect() { config.emitter.emit("disconnect"); },
  }));
}
