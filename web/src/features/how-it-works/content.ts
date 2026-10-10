// Ported from Masayume 68f7a09:web/src/features/how-it-works/content.ts — the page's content as data, each fact
// rewritten for Mitoshi's engine on Tempo (L-12) and only what is live (D-094).
import { ClockIcon, CoinsIcon, KeyRoundIcon, LockIcon, LogOutIcon, ShieldIcon, TargetIcon, TrophyIcon, ZapIcon, type LucideIcon } from "lucide-react";

/**
 * Sources (asserted, not assumed): `contracts/src/engine/libs/ResolveLib.sol` (UP wins at or above the opening print;
 * void ½), `docs/specs/engine.md` (on-chain signer check of each print; no settlement fee, Q-005; no trading-fee
 * field), `web/src/features/markets/copy/verdict.ts` (the settler pays after a short grace; a blocked payout is held as
 * credit), D-138 (the wallet key's daily limit and expiry), D-150/D-197 (CLOSE pays what the line shows), D-193/D-194
 * (exits with the app closed; the house keeps its exit side to T−30 s), D-196 (the line is a display feed; settlement
 * never is), `docs/plan/acceptance/S23.md` (send → receipt p50 0.53 s).
 */

export type Tone = "mint" | "blue";

export interface Step {
  number: number;
  title: string;
  description: string;
  icon: LucideIcon;
  tone: Tone;
}

export const STEPS: readonly Step[] = [
  {
    number: 1,
    title: "Sign up with a passkey",
    description: "Face ID, a fingerprint or a security key creates your account on Tempo — no seed phrase, no extension. On testnet, Add money mints testnet dollars (pathUSD) from the faucet; they have no value.",
    icon: KeyRoundIcon,
    tone: "mint",
  },
  {
    number: 2,
    title: "Pick a Window",
    description: "Each Window is one asset over one lane: five minutes, fifteen or an hour. BTC, ETH and SOL run around the clock; US stocks run in and out of NYSE hours on RedStone's 24/7 feeds. The line on the chart is the Window's opening print.",
    icon: TargetIcon,
    tone: "blue",
  },
  {
    number: 3,
    title: "Tap UP or DOWN",
    description: "UP wins if the Window closes at or above its opening print, DOWN if below. The button shows what a right call pays per dollar; your stake is the most you can lose.",
    icon: ZapIcon,
    tone: "mint",
  },
  {
    number: 4,
    title: "Close it or let it settle",
    description: "CLOSE sells your position back to the book at what the line shows. Held to the end, each winning contract pays $1 and a losing one nothing; the settler pays winners on its own a few minutes after the close.",
    icon: TrophyIcon,
    tone: "blue",
  },
];

export interface Mechanic {
  title: string;
  description: string;
  icon: LucideIcon;
}

export const MECHANICS: readonly Mechanic[] = [
  {
    title: "One book per Window",
    description: "A fully on-chain order book on Tempo. UP and DOWN are its two sides; makers rest prices on both once the Window's opening print is in, and your tap takes what is there, immediate-or-cancel.",
    icon: CoinsIcon,
  },
  {
    title: "A live line, a signed close",
    description: "The line follows a live display feed so you can see where it's going. The Window settles only on RedStone's signed prints, checked on chain — never on the display feed.",
    icon: ClockIcon,
  },
  {
    title: "One tap, no prompt",
    description: "Your passkey signs once to publish an access key with a daily dollar limit and a 24-hour expiry. Taps inside it sign themselves, and Mitoshi's relay pays the network fee.",
    icon: KeyRoundIcon,
  },
  {
    title: "Exits that run while you're away",
    description: "Take-profit, stop-loss and trailing stops on a Trading Balance position are sold by a keeper when they trigger, with the app closed. The house keeps its side of those exits open until 30 seconds before the close.",
    icon: LogOutIcon,
  },
  {
    title: "Your stake is your risk",
    description: "UP and DOWN never lose more than you staked. Boost is the leveraged play: the reserve fronts part of the stake and is repaid first from the sale.",
    icon: ShieldIcon,
  },
  {
    title: "Every five minutes",
    description: "A new five-minute Window opens on each crypto asset every five minutes, so there is always a round about to start.",
    icon: LockIcon,
  },
];

/** What the ticket shows for a stake, read off the live book. */
export const QUOTE_FIELDS: readonly [string, string][] = [
  ["stake", "what you put in, in dollars"],
  ["contracts", "how many the book fills for that stake"],
  ["avg price", "the average fill across the book's levels, in cents"],
  ["max cost", "escrow locked at the protective limit — a fill can never cost more"],
  ["pays", "what a right call returns per dollar: 1 ÷ price"],
  ["fees", "none to trade or settle; the network fee is sponsored"],
];

export interface FeeItem {
  title: string;
  body: string;
}

export const FEES: readonly FeeItem[] = [
  { title: "Network fees", body: "Paid in dollars by Mitoshi's relay for taps inside its policy. You hold no gas token." },
  { title: "Trading fees", body: "None. The engine has no trading fee: the price you see is the book's." },
  { title: "Settlement", body: "None. A winning contract pays $1.00, all of it." },
];

export interface SettlementStep {
  step: string;
  label: string;
  desc: string;
}

export const SETTLEMENT_STEPS: readonly SettlementStep[] = [
  { step: "1", label: "Window closes", desc: "Trading stops just before its scheduled close; the clock on screen counts to it." },
  { step: "2", label: "Signed prints", desc: "RedStone's signed packages for the open and the close are posted on chain by Mitoshi's price relay; the engine checks their signers itself." },
  { step: "3", label: "Settlement", desc: "Anyone can settle: the engine compares the close with the open (a tie goes UP). With no reliable print in time, the Window voids and both sides are returned at half." },
  { step: "4", label: "Payout", desc: "The settler pays every winning position on its own a few minutes after the close; collecting it yourself only hurries it. A payout your account's receive policy blocks waits as credit." },
];

export interface ArchitectureCard {
  title: string;
  body: string;
  icon: LucideIcon;
}

export const ARCHITECTURE: readonly ArchitectureCard[] = [
  { title: "Positions you hold", body: "Contracts are balances in the engine held by your account — or by your Trading Balance for you — and every fill links to its Tempo receipt.", icon: CoinsIcon },
  { title: "Receipts in half a second", body: "A tap's transaction is in a block about half a second after it is sent on Tempo testnet, so the position on screen is the one on chain.", icon: ZapIcon },
  { title: "Rules in the contract", body: "Settlement, voids and payouts are contract calls anyone can make once a Window's prints are in or its time is up; Mitoshi's keepers just make them first.", icon: ShieldIcon },
];

export interface Faq {
  question: string;
  answer: string;
}

export const FAQS: readonly Faq[] = [
  {
    question: "What money does Mitoshi use?",
    answer: "pathUSD, Tempo's dollar stablecoin, for stakes, payouts and fees. On testnet it comes from the faucet (Add money) and has no value.",
  },
  {
    question: "Do I need a wallet?",
    answer: "No. A passkey is your account. If you already have one, you can sign in with Tempo Wallet or another wallet instead.",
  },
  {
    question: "How is the outcome decided?",
    answer: "By RedStone's signed prints at the Window's open and close. Close at or above the open and UP wins; below it and DOWN wins. The comparison happens in the contract.",
  },
  {
    question: "How much can I win or lose?",
    answer: "A winning contract pays $1, so a right call returns 1 ÷ the price you paid per dollar staked — the multiple on the button. A wrong call loses the stake, and never more.",
  },
  {
    question: "Who is on the other side?",
    answer: "Whoever rests the price you take: other traders and the makers quoting the book — Mitoshi's house maker and the maker vault, which quote around a fair-value model of the price.",
  },
  {
    question: "What if the oracle fails?",
    answer: "If no reliable print arrives in time, the Window voids and both sides are returned at half. The settler pays that too.",
  },
  {
    question: "And the stocks?",
    answer: "Tokenized stocks to hold and trade on Tempo are next: their pools and price guard are deployed on Moderato, and the screens are being built. Today, stocks are Windows.",
  },
];
