/**
 * The landing's words (R4-13a, D-227; Ported from Owarine 90a91d71:web/src/features/landing/words.ts, at its word count).
 * Every claim is something Mitoshi does today on Tempo testnet (D-094). Numbers on the page — Windows open per kind,
 * signed prints, settled Windows, the index's counts — are read from the index per request (`board.ts`), never written
 * here.
 */
export const WORDS = {
  nav: { label: "Mitoshi", markets: "Markets", games: "Games", how: "How it works", app: "Get the app", docs: "Docs", start: "Start trading", home: "Mitoshi home", menu: "Menu" },
  hero: {
    kicker: "Live on",
    title: ["See where it's going.", "Call"],
    accent: "the close.",
    line: "Up or down on crypto and stocks, in minutes. On your phone or in your browser.",
    start: "Start trading",
    app: "Get the app",
    stage: "Mitoshi on three phones: the live terminal, Markets and Games",
    /** The markets the tape and the bento name. */
    assets: ["BTC", "ETH", "SOL", "TSLA", "NVDA"],
    assetsLabel: "Some of the markets",
  },


  /** The hero phone's screen (R6 landing L01). */
  phone: {
    live: "live",
    closesIn: (t: string) => `calls close ${t}`,
    closesAt: (t: string) => `calls close ${t} UTC`,
    rolling: "next Window…",
    next: "next Window",
    nextLine: "Calls open on the next Window",
    level: "Level with the open",
    ahead: (side: string, delta: string) => `${side} ahead · ${delta}`,
    opened: (p: string) => `opened ${p}`,
    pays: (x: string) => `pays ${x}`,
    reconnecting: "reconnecting",
    label: (side: string, where: string, pays: string | null) => `${side} on ${where}${pays ? `, pays ${pays}` : ""}. Opens the terminal`,
    screen: "Mitoshi on a phone, live",
  },
  tape: { label: "Live now", signed: (t: string) => `signed ${t}` },
  /** The features bento (21st.dev 18898): one idea a tile, a real fragment where there is one. */
  bento: {
    kicker: "One app",
    title: "Crypto and stocks. Same two buttons.",
    crypto: { eyebrow: "24/7", title: "Crypto, round the clock", line: "BTC, ETH and SOL. Windows every 5, 15 and 60 minutes." },
    stocks: { eyebrow: "Nights included", title: "Stocks, past the bell", line: "Seven names trade 24/7. The rest, in session." },
    games: { title: "Games", line: "Range, Moonshot, Duel. Same prices." },
    parlay: { title: "Parlay", line: "Two or three Windows. The odds multiply." },
    agents: { title: "Agents", line: "They call for you, inside your limits." },
    passkey: { title: "Passkey", line: "Face ID. No seed phrase." },
    private: { title: "Private", line: "Kept apart from your wallet." },
  },
  how: {
    kicker: "How it works",
    title: "Pick. Call. Settle.",
    steps: [
      { n: "01", title: "Pick a Window", line: "Each opens on a signed price and closes on the clock.", shot: "markets", crop: "top", alt: "A Window in the app: BTC holds above its opening price?, with its countdown" },
      { n: "02", title: "Call UP or DOWN", line: "Paper needs nothing. Test dollars start with your passkey.", shot: "trade", crop: "bottom", alt: "The terminal's UP and DOWN, each with what it pays" },
      { n: "03", title: "Settles on the print", line: "RedStone signs the close. The verdict links its proof.", shot: "markets", crop: "chart", alt: "The line against the dashed opening print" },
    ],
  },
  proof: {
    kicker: "Settled in public",
    title: "Every close is signed.",
    body: "RedStone signs each closing print. Anyone can check it.",
    settled: "Just settled",
    signers: (n: number) => `${n} signers`,
    ago: (t: string) => `${t} ago`,
    outcome: { up: "UP won", down: "DOWN won", void: "Stakes returned" },
    figures: { opened: "Windows opened", resolved: "Settled on a signed print", today: "Settled today" },
    none: "The first close lands at the next Window.",
    unread: "Proofs are on every Window's page.",
  },
  final: {
    title: ["Your first call.", "One tap away."],
    line: "On your phone or right here in the browser.",
    start: "Start trading",
    scan: "Scan for the app",
    qr: "QR code to Mitoshi's download page",
  },
  footer: {
    tagline: "See where it's going.",
    built: "Built on Tempo · prices signed by RedStone",
    marks: "Tempo and RedStone marks belong to their owners.",
    columns: [
      { title: "Product", links: [{ label: "Markets", href: "/markets" }, { label: "Games", href: "/games" }, { label: "Agents", href: "/agents" }, { label: "Get the app", href: "/download" }] },
      { title: "Learn", links: [{ label: "How it works", href: "/how-it-works" }, { label: "Docs", href: "https://docs.mitoshi.xyz" }, { label: "Demo", href: "/demo" }, { label: "Status", href: "/status" }] },
      { title: "Legal", links: [{ label: "Privacy", href: "/privacy" }, { label: "Terms", href: "/terms" }, { label: "Contact", href: "/contact" }] },
    ],
  },
} as const;
