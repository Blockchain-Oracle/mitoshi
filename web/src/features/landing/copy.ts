/**
 * The landing's words (S20, L-11). Both pillars stand equal; every claim is something that exists and is said to be
 * live only when it is (D-094): the terminal, its one-tap path and exits (S23, S24), Range/Moonshot/Parlay/Boost (S10),
 * the settler (S3). Stocks are deployed contracts with their screens next (`/stocks` says what it waits on).
 */
export const LANDING = {
  hero: {
    prefix: "Tap UP or DOWN",
    joiner: "on",
    assets: ["BTC", "ETH", "SOL", "TSLA", "NVDA"],
    lead: "A live price, a Window that closes on a signed oracle print, and two buttons. Sign up with a passkey: no wallet to install, no gas token, no prompt on every tap.",
    cta: "Start trading",
    secondary: "How it works",
  },
  phone: {
    eyebrow: "The terminal",
    title: "This is the app, running.",
    body: "This phone is the live terminal on Tempo testnet, not a recording. The line is the price; UP and DOWN take a position in the Window on screen; CLOSE sells it back at what the line shows.",
    open: "Open it full screen",
    frameTitle: "Mitoshi's terminal, live",
  },
  pillars: {
    eyebrow: "Two ways in",
    title: "Predictions now. Stocks next.",
    lead: "One account, one passkey, one balance in dollars.",
    markets: {
      tag: "Live on testnet",
      title: "Call where a price closes",
      body: "BTC, ETH, SOL and US stocks in Windows from five minutes to the hour, on RedStone's feeds in and out of NYSE hours. Your stake is the most you can lose. Range, Moonshot, Parlay and Boost price against the same book.",
      link: "Open the terminal",
    },
    stocks: {
      tag: "Next",
      title: "Own the stock, on Tempo",
      body: "Tokenized stocks traded on Tempo beside the Windows, priced against signed quotes with the backing on show. The pools and their price guard are deployed on Moderato; the screens are being built.",
      link: "What it will do",
    },
    metrics: [
      { value: "0.64 s", label: "press to position", caption: "Median of seven taps on Tempo testnet, 2026-10-10, no prompt." },
      { value: "1", label: "biometric to arm", caption: "Then every tap inside your daily limit signs itself." },
    ],
    autoTitle: "Runs on its own",
    auto: [
      "Take-profit, stop-loss and trailing stops close with the app shut",
      "Each Window settles on its signed print",
      "Winners are paid without a claim",
    ],
  },
  steps: {
    eyebrow: "How it works",
    title: "Three steps to a position",
    items: [
      { n: "01", title: "Sign up with a passkey", body: "Face ID, a fingerprint or a security key. No seed phrase, no extension; testnet dollars come from the faucet." },
      { n: "02", title: "Arm one-tap", body: "One more biometric publishes a key with a daily limit, so every tap after it goes through with no prompt and the fee sponsored." },
      { n: "03", title: "Tap UP or DOWN", body: "The line moves with the price. CLOSE sells at what it shows, or let the Window settle on its print." },
    ],
    cta: "Start trading",
  },
  figures: {
    eyebrow: "On Tempo testnet",
    title: "Counted on chain",
    lead: "Straight from the indexer's count of Moderato's events, refreshed every few minutes.",
    opened: "Windows opened",
    resolved: "Windows resolved on their print",
    open: "Windows open right now",
  },
  cta: {
    title: "One line. One tap.",
    body: "Open the terminal on your phone or your desk. A passkey is all it takes.",
    button: "Start trading",
  },
} as const;
