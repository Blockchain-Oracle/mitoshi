/**
 * Ported from Masayume 68f7a09:web/src/features/funding/copy.ts. Somnia's two-step STT-then-tUSDC story is gone: on
 * Tempo there is no gas token, fees are paid in dollars (and sponsored for passkey accounts), and Moderato's own
 * faucet sends four test stablecoins in one request. Mainnet has no faucet (L-26): the dialog lists real ways in.
 */
export const FUNDING = {
  modal: {
    eyebrow: "Add money",
    testnetTitle: "Get test dollars",
    testnetBody: "Tempo's testnet faucet sends test stablecoins (pathUSD, AlphaUSD, BetaUSD, ThetaUSD) to your account. They are play money: nothing here is real.",
    mainnetTitle: "Add dollars",
    mainnetBody: "Send USD stablecoins on Tempo to your account address, from an exchange or another wallet. We never hold your money.",
    mainnetWays: [
      { title: "From an exchange", body: "Withdraw a USD stablecoin to your address on the Tempo network." },
      { title: "From another wallet", body: "Send pathUSD or another USD stablecoin on Tempo to this address." },
    ],
    account: "Your account address",
    copy: "Copy",
    copied: "Copied",
    balance: "In your account",
    request: "Get test dollars",
    passkeyNote: "No signature needed: your passkey session already proves this account is yours.",
    walletNote: "Your wallet asks you to sign a short message. Signing is free and gives no permission to spend.",
    signing: "Sign the request in your wallet…",
    funding: "Asking the testnet faucet…",
    done: "Test dollars are in your account.",
    again: (when: string) => `This account can ask again ${when}.`,
    trade: "Go to Markets",
    close: "Close add money",
    connectFirst: "Sign in first — test dollars go to your account.",
    signIn: "Sign in",
  },
  errors: {
    cooldown: "This account already got test dollars today.",
    ip_quota: "Too many requests from this network today. Try again tomorrow.",
    daily_cap: "Test dollars are used up for today. Try again tomorrow.",
    region_restricted: "Markets aren't available in your region, so we can't send test dollars here. Browsing stays open.",
    no_session: "Your sign-in expired. Sign in again, then ask for test dollars.",
    challenge_expired: "That request expired. Ask again.",
    bad_signature: "The signature didn't match this account. Nothing was sent.",
    unavailable: "Test dollars aren't available on this deployment right now.",
    fund_failed: "The testnet faucet didn't answer. Nothing was sent; try again in a moment.",
    rejected: "You cancelled the signature. Nothing was sent.",
    unknown: "Something went wrong asking for test dollars. Nothing was sent.",
  },
  receipt: {
    title: "Test dollars",
    figureLabel: "In your account now",
    transfer: (n: number, of: number) => `Transfer ${n} of ${of}`,
    footer: "Sent by Tempo's testnet faucet. Play money.",
  },
  welcome: {
    eyebrow: "You're funded",
    title: "Test dollars are in your account",
    body: "Play money on Tempo's testnet. You're ready to make your first call.",
    cta: "Let's go",
    close: "Close",
  },
} as const;

export type FaucetErrorCode = keyof typeof FUNDING.errors;

/** Masayume's `masayume:credited`, under our name: only a first credit per address fires the welcome. */
export const CREDITED_EVENT = "cwf:credited";
