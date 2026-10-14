/**
 * The wagmi 3 config (plan C.3.1; web-stack §4.4; D-055 wagmi 3 names). One chain: Tempo (Moderato on testnet, pathUSD
 * as the default fee token); D-231 removed the bridge's side chains. Connectors: passkeys (`webAuthn` with our
 * `/api/auth` ceremony and `/api/relay` fee payer), Tempo Wallet, EIP-6963 injected wallets, and WalletConnect (a phone
 * has no injected wallet); Tempo Wallet and WalletConnect are built on first use (D-152). `ssr` + cookie storage restore a connection after a reload; the shell renders "signed out" first and restores after hydration (Agari's pattern), so no
 * cookie is read on the server and the static shell survives (D-050).
 */
import { tempoChain, tempoTransport } from "@cwf/markets";
import type { Transport } from "viem";
import { cookieStorage, createConfig, createStorage, type Config } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { tempoWallet, webAuthn } from "wagmi/tempo";
import { webEnv } from "@/lib/env";
import { accessKeyPolicy } from "./access-key";
import { PASSKEY_RDNS, TEMPO_WALLET_CONNECTOR_ID } from "./connector-kind";
import { lazyConnector } from "./lazy-connector";
import { reviewerConnector } from "./reviewer-connector";

const env = webEnv.markets;
export const TEMPO_CHAIN = tempoChain(env.network);

function transports(): Record<number, Transport> {
  return {
    // HTTP only, like every other signer here (the session and wallet keys): the wallet signs and sends, it subscribes
    // to nothing. A WebSocket first in the fallback hung every root write on a freshly loaded page — the socket stuck
    // opening, which never errors, so viem never fell back (Stop on /settings/account, 2026-10-09: no frame in 120 s).
    [TEMPO_CHAIN.id]: tempoTransport({ rpcHttpUrls: env.rpcHttpUrls, relayUrl: env.relayUrl }),
  };
}

/** WalletConnect needs a Reown project id; without one its row says so instead of opening a broken modal. */
export const WALLETCONNECT_ENABLED = Boolean(webEnv.walletConnectProjectId);

let config: Config | null = null;

export function getWagmiConfig(): Config {
  config ??= createConfig({
    chains: [TEMPO_CHAIN],
    connectors: [
      webAuthn({
        name: "Passkey",
        rdns: PASSKEY_RDNS,
        testnet: env.network === "testnet",
        authUrl: env.authUrl,
        feePayer: env.relayUrl,
        // D-047 wallet-mode access key: authorised in the sign-in ceremony once the engine exists (S4). Until then the
        // policy returns undefined and no key is created.
        accessKey: { authorize: accessKeyPolicy },
      }),
      ...(env.network === "testnet" ? [reviewerConnector()] : []),
      // Built on first use: its wallet.tempo.xyz iframe (and ~1 MB of third-party script) mounts at setup (D-152). Its
      // accounts store gets its own IndexedDB key: the passkey's provider keeps `tempo.store` (accounts' default), and a
      // Tempo Wallet store that starts empty must never persist over it (F-S23-10).
      lazyConnector({ id: TEMPO_WALLET_CONNECTOR_ID, name: "Tempo Wallet", icon: "/wallet/tempo.svg", rdns: TEMPO_WALLET_CONNECTOR_ID, type: "injected" }, async () => {
        const { Storage } = await import("accounts");
        return tempoWallet({ storage: Storage.idb({ key: "tempo-wallet" }) });
      }),
      injected(),
      // wagmi's WalletConnect initialises its provider (and relay socket) in `setup` — also built on first use.
      ...(WALLETCONNECT_ENABLED ? [lazyConnector({ id: "walletConnect", name: "WalletConnect", icon: "/wallet/walletconnect.svg", type: "walletConnect" }, () => walletConnect({ projectId: webEnv.walletConnectProjectId!, showQrModal: true }))] : []),
    ],
    multiInjectedProviderDiscovery: true,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: transports(),
  });
  return config;
}
