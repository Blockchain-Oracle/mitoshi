/**
 * The wagmi 3 config (plan C.3.1; web-stack §4.4; D-055 wagmi 3 names). Testnet chains: Moderato (pathUSD as the
 * default fee token), Robinhood Chain testnet and Base Sepolia (the two-wallet model); mainnet: Tempo and Robinhood.
 * Connectors: passkeys (`webAuthn` with our `/api/auth` ceremony and `/api/relay` fee payer), Tempo Wallet, EIP-6963
 * injected wallets, and WalletConnect (phones have no injected wallet for bridge-in); Tempo Wallet and WalletConnect are
 * built on first use (D-152). `ssr` + cookie storage restore a connection after a reload; the shell renders "signed out" first and restores after hydration (Agari's pattern), so no
 * cookie is read on the server and the static shell survives (D-050).
 */
import { tempoChain, tempoTransport } from "@cwf/markets";
import { http, type Transport } from "viem";
import { baseSepolia, robinhood, robinhoodTestnet } from "viem/chains";
import { cookieStorage, createConfig, createStorage, type Config } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { tempoWallet, webAuthn } from "wagmi/tempo";
import { webEnv } from "@/lib/env";
import { accessKeyPolicy } from "./access-key";
import { TEMPO_WALLET_CONNECTOR_ID } from "./connector-kind";
import { lazyConnector } from "./lazy-connector";

const env = webEnv.markets;
export const TEMPO_CHAIN = tempoChain(env.network);
export const SIDE_CHAINS = env.network === "mainnet" ? ([robinhood] as const) : ([robinhoodTestnet, baseSepolia] as const);

function transports(): Record<number, Transport> {
  const out: Record<number, Transport> = {
    // HTTP only, like every other signer here (the session and wallet keys): the wallet signs and sends, it subscribes
    // to nothing. A WebSocket first in the fallback hung every root write on a freshly loaded page — the socket stuck
    // opening, which never errors, so viem never fell back (Stop on /settings/account, 2026-10-09: no frame in 120 s).
    [TEMPO_CHAIN.id]: tempoTransport({ rpcHttpUrls: env.rpcHttpUrls, relayUrl: env.relayUrl }),
  };
  for (const chain of SIDE_CHAINS) out[chain.id] = http();
  return out;
}

/** WalletConnect needs a Reown project id; without one its row says so instead of opening a broken modal. */
export const WALLETCONNECT_ENABLED = Boolean(webEnv.walletConnectProjectId);

let config: Config | null = null;

export function getWagmiConfig(): Config {
  config ??= createConfig({
    chains: [TEMPO_CHAIN, ...SIDE_CHAINS],
    connectors: [
      webAuthn({
        testnet: env.network === "testnet",
        authUrl: env.authUrl,
        feePayer: env.relayUrl,
        // D-047 wallet-mode access key: authorised in the sign-in ceremony once the engine exists (S4). Until then the
        // policy returns undefined and no key is created.
        accessKey: { authorize: accessKeyPolicy },
      }),
      // Built on first use: its wallet.tempo.xyz iframe (and ~1 MB of third-party script) mounts at setup (D-152).
      lazyConnector({ id: TEMPO_WALLET_CONNECTOR_ID, name: "Tempo Wallet", rdns: TEMPO_WALLET_CONNECTOR_ID, type: "injected" }, () => tempoWallet()),
      injected(),
      // wagmi's WalletConnect initialises its provider (and relay socket) in `setup` — also built on first use.
      ...(WALLETCONNECT_ENABLED ? [lazyConnector({ id: "walletConnect", name: "WalletConnect", type: "walletConnect" }, () => walletConnect({ projectId: webEnv.walletConnectProjectId!, showQrModal: true }))] : []),
    ],
    multiInjectedProviderDiscovery: true,
    ssr: true,
    storage: createStorage({ storage: cookieStorage }),
    transports: transports(),
  });
  return config;
}
