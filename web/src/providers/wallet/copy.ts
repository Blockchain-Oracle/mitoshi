/**
 * The sign-in modal's words (Agari 03b30ab:web/src/providers/wallet/copy.ts carried RainbowKit's strings), at Owarine
 * 90a91d71's counts (D-223/D-224): a title, the rows, one named wait, a failure with its retry. Passkeys first.
 */
import { BRAND } from "@/lib/copy";

export const SIGN_IN = {
  title: `Sign in to ${BRAND.name}`,
  noInjected: "No browser wallet here.",
  waiting: { passkey: "Waiting for your passkey…", wallet: (name: string) => `Opening ${name}…` },
  retry: "Try again",
  back: "Back",
  technical: "Technical details",
  nothingTaken: "Nothing was taken.",
  robinhood: {
    title: "Link a Robinhood Chain wallet",
    body: "Link the wallet that holds your stock tokens.",
    none: "Open in a wallet's browser, or use WalletConnect.",
  },
} as const;

/**
 * The compact sign-in list's frame words (Owarine 90a91d71 `WALLET_MODAL`, RainbowKit 2.2.11's `en_US`; O-9, D-222),
 * said for passkeys: Mitoshi's accounts are passkeys first, wallets after.
 */
export const WALLET_MODAL = {
  close: "Close",
  back: "Back",
  groups: { passkey: (network: string) => `Passkey · ${network}`, wallets: "Wallets" },
  rows: {
    create: "Create account",
    signIn: "I have a passkey",
  },
  newTo: "New to passkeys?",
  learnMore: "Learn more",
  intro: {
    title: "What is a passkey?",
    assetsTitle: "Your account, on your device",
    assetsBody: "Made on this device. No seed phrase, no password.",
    loginTitle: "One tap to sign in",
    loginBody: "Face ID or Touch ID. No fees.",
    get: "Create account",
  },
  status: { loading: "Loading" },
} as const;

/** The account popover (Owarine 90a91d71 `SeatAccountMenu`; O-10, D-224). */
export const ACCOUNT = {
  kinds: { passkey: "Passkey", "tempo-wallet": "Tempo Wallet", injected: "Browser wallet", walletconnect: "WalletConnect" },
  network: { testnet: "Tempo testnet", mainnet: "Tempo" },
  address: "Address",
  wallet: "Wallet",
  tradingBalance: "Trading Balance",
  tradingBalancePending: "Not open",
  robinhood: "Robinhood Chain",
  linkRobinhood: "Link a wallet",
  copy: "Copy address",
  copied: "Copied",
  keys: "Account & keys",
  signOut: "Sign out",
} as const;
