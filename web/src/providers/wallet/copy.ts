/**
 * The sign-in and account modals' words. Agari 03b30ab:web/src/providers/wallet/copy.ts carried RainbowKit's strings;
 * Mitoshi signs in with a passkey first (dollars and actions, no crypto jargon up front, §2.1.4), with wallets listed.
 */
import { BRAND } from "@/lib/copy";

export const SIGN_IN = {
  eyebrow: "Sign in",
  title: `Sign in to ${BRAND.name}`,
  body: "Use Face ID, Touch ID or a security key. No seed phrase, no password, and no network fees to pay.",
  create: "Create my account",
  nameLabel: "Name this passkey (optional)",
  namePlaceholder: "e.g. My phone",
  signIn: "I already have one — sign in",
  orWallet: "Or use a wallet",
  tempoWallet: { name: "Tempo Wallet", note: "Sign in with your wallet.tempo.xyz account" },
  walletConnect: { name: "WalletConnect", note: "Scan with a phone wallet", missing: "Not available: WalletConnect isn't configured on this deployment yet" },
  injectedNote: "Browser wallet — trades need one confirmation each and pay their own fee",
  noInjected: "No browser wallet found in this browser. A passkey works everywhere.",
  footer: "Your passkey never leaves your device. We store only its public key.",
  waiting: { passkey: "Waiting for your passkey…", wallet: (name: string) => `Opening ${name}…` },
  cancel: "Cancel",
  retry: "Try again",
  back: "Back",
  technical: "Technical details",
  robinhood: {
    title: "Link a Robinhood Chain wallet",
    body: "Stock tokens start on Robinhood Chain. Link the wallet that holds them to bring them to Tempo; your Tempo account stays as it is.",
    none: "Open this page in a wallet's browser, or connect one with WalletConnect.",
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
    assetsBody: "Made by this device and never leaves it. No seed phrase, no password.",
    loginTitle: "One tap to sign in",
    loginBody: "Face ID or Touch ID signs you in. No fees to pay.",
    get: "Create account",
  },
  status: { loading: "Loading" },
} as const;

export const ACCOUNT = {
  title: "Your account",
  kinds: { passkey: "Passkey", "tempo-wallet": "Tempo Wallet", injected: "Browser wallet", walletconnect: "WalletConnect" },
  network: { testnet: "Tempo testnet", mainnet: "Tempo" },
  wallet: "Wallet",
  tradingBalance: "Trading Balance",
  tradingBalancePending: "Opens with the Trading Balance",
  robinhood: "Robinhood Chain wallet",
  linkRobinhood: "Link a wallet",
  copy: "Copy address",
  copied: "Copied",
  keys: "Account & keys",
  signOut: "Sign out",
  injectedCaps: "This wallet signs each trade itself and pays its own fee; passkeys trade without prompts once armed.",
} as const;
