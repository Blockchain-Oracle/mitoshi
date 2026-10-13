/**
 * Add money, as Owarine 90a91d71 `AddFunds` (D-224): one figure, one tag, one button, a status line only when something
 * needs doing. Moderato's faucet sends test stablecoins in one request; mainnet has no faucet (L-26) and shows the
 * address. A new account is funded by the server right after its passkey (`FirstFund`), as Owarine's seat is.
 */
export const FUNDING = {
  modal: {
    eyebrow: "Add money",
    testnetTitle: "Test dollars",
    mainnetTitle: "Add dollars",
    mainnetBody: "Send USD stablecoins on Tempo to this address.",
    balance: "In your account",
    tag: "Tempo testnet · no cash value",
    account: "Your address",
    copy: "Copy",
    copied: "Copied",
    request: "Get test dollars",
    signing: "Sign in your wallet…",
    funding: "Asking the faucet…",
    done: "Test dollars are in your account.",
    again: (when: string) => `Again ${when}.`,
    trade: "Trade",
    close: "Close add money",
    connectFirst: "Sign in first.",
    signIn: "Sign in",
    qr: "QR",
    qrHide: "Hide QR",
    qrLabel: "Your address as a QR code, to receive pathUSD on Tempo",
    bridge: "Bring stock tokens from Robinhood →",
  },
  errors: {
    cooldown: "Already funded today.",
    ip_quota: "Too many requests from this network today.",
    daily_cap: "Test dollars are used up for today.",
    region_restricted: "Not available in your region.",
    no_session: "Your sign-in expired. Sign in again.",
    challenge_expired: "That request expired. Ask again.",
    bad_signature: "The signature didn't match. Nothing was sent.",
    unavailable: "Not available on this deployment.",
    fund_failed: "The faucet didn't answer. Nothing was sent.",
    rejected: "Cancelled. Nothing was sent.",
    unknown: "Something went wrong. Nothing was sent.",
  },
  receipt: {
    title: "Test dollars",
    figureLabel: "In your account now",
    transfer: (n: number, of: number) => `Transfer ${n} of ${of}`,
    footer: "Tempo testnet faucet.",
  },
  /** Owarine's `CreditWelcome`: a title and one button, gone in eight seconds. */
  welcome: {
    title: "You're funded",
    titleWith: (held: string) => `${held} in your account`,
    cta: "Let's go",
    close: "Close",
  },
  /** The server-side funding of a brand-new account, when it didn't land. */
  firstFund: {
    landed: (amount: string) => `+${amount} test dollars`,
    funding: "Funding your account…",
    failed: "Test dollars didn't arrive.",
    addMoney: "Add money",
  },
} as const;

export type FaucetErrorCode = keyof typeof FUNDING.errors;

/** Masayume's `masayume:credited`, under our name: only a first credit per address fires the welcome. */
export const CREDITED_EVENT = "cwf:credited";
