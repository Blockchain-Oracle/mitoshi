// /privacy's sections (R4-13a, D-227: LegalScreen's cards, one per former heading, each with a one-line gist; the
// points keep the page's text in substance). What Mitoshi keeps, from what the code stores — the passkey credential
// and session (auth-handler), the install id and hashed IP (server/request.ts), route-only vitals (D-071), the relay's
// ledger, the per-request region read (server/region.ts), the social layer (`social/0001-0004`), Sensei's consent-first
// sharing (`/api/sensei`), device-only alerts, `/contact`, and the download and deletion in `/settings/account`.
import { Bot, Database, Download, Globe2, KeyRound, Mail, MessagesSquare, Smartphone, Users } from "lucide-react";
import type { LegalSection } from "./LegalAccordion";

export const PRIVACY_SECTIONS: readonly LegalSection[] = [
  {
    id: "keeps", title: "What Mitoshi keeps", gist: "Your passkey's public half, a session, fee and speed records.", icon: <KeyRound />,
    points: [
      <><b>Your passkey&apos;s public key and credential id</b>, and the Tempo address from it, to sign you in. The private key never leaves your device.</>,
      <><b>A session cookie</b> (<code>cwf_passkey</code>, 30 days) for the faucet claim and the live stream&apos;s ticket.</>,
      <><b>A random install id</b> sent with fee-relay requests, so fee budgets hold per device. No name or email is ever asked.</>,
      <><b>The relay&apos;s ledger</b>: the network fees it paid for you, by address and install id.</>,
      <><b>IP addresses only as hashes</b>, to rate-limit the faucet and a few endpoints.</>,
      <><b>Page-speed timings</b> with the route only: no account, no address.</>,
      <>Your country is read per request to keep markets closed where they aren&apos;t allowed. It isn&apos;t stored.</>,
    ],
  },
  {
    id: "posts", title: "What you post", gist: "Public: your name, takes, messages and reactions.", icon: <MessagesSquare />,
    points: [
      <><b>Your public name and bio</b>, if set, on your profile and beside your posts.</>,
      <><b>Takes, room messages and reactions</b>: public, with your address. Filtered words are starred when shown; the original is kept.</>,
      <><b>Follows, blocks and reports.</b> Who you block and what you report are never shown to them.</>,
      <><b>A social session cookie</b> (<code>cwf_social</code>, 30 days) when you sign in with a wallet: one signature lets this browser post as you.</>,
      <>A moderator may hide a reported post. Hidden posts stay stored until you delete your data.</>,
    ],
  },
  {
    id: "sensei", title: "Sensei and AI", gist: "Nothing is sent until you agree to the provider it names.", icon: <Bot />,
    points: [
      <>When you ask, the server sends that provider your question, up to 12 turns of the conversation and the figures on your screen: prices, the Window&apos;s line and prices, your positions as amounts, your settled record, earnings dates.</>,
      <>Never your address, keys, name or email. The conversation isn&apos;t stored; it stays in your tab.</>,
      <>Stop sharing from Sensei or from Settings → Account.</>,
    ],
  },
  {
    id: "device", title: "On your device only", gist: "Alerts and settings stay in your browser.", icon: <Smartphone />,
    points: [<>Price alerts, notification choices, the AI agreement and display settings live in your browser&apos;s storage. The servers never see them.</>],
  },
  {
    id: "contact", title: "When you contact us", gist: "Kept so someone can answer.", icon: <Mail />,
    points: [<>The topic, your message, an email only if you gave one, and your address only if you were signed in.</>],
  },
  {
    id: "delete", title: "Download or delete", gist: "One file out, or everything off chain gone.", icon: <Download />,
    points: [
      <>Settings → Account downloads everything kept off chain about your account as one file, and deletes it: profile, takes, messages, reactions, follows, your blocks and reports, game seats and signed-in contact messages.</>,
      <>Deleting asks for a fresh signature, waits five seconds so you can undo, and ends your sessions. Blocks others placed on you stay theirs.</>,
      <>Your passkey&apos;s public key (and any backup&apos;s) stays: your Tempo account still exists, and that key signs you in to it.</>,
    ],
  },
  {
    id: "chain", title: "On chain", gist: "Your trades are public on Tempo, as everyone's are.", icon: <Database />,
    points: [<>Your address, trades, balances and receipts are public on the blockchain. Mitoshi&apos;s indexer reads that public record to show your positions and history, as anyone could.</>],
  },
  {
    id: "others", title: "Others involved", gist: "Tempo's RPC, price feeds, your wallet and the AI you pick.", icon: <Users />,
    points: [
      <>Tempo&apos;s RPC receives the transactions you sign.</>,
      <>Prices reach you from Mitoshi&apos;s servers, which fetch them from RedStone and the display feeds.</>,
      <>Tempo Wallet or WalletConnect, if you sign in with one, handles that sign-in under its own policy.</>,
      <>The AI provider Sensei names receives what&apos;s listed above, under its API terms.</>,
      <>Notifications are made on your device, only if you allow them.</>,
    ],
    foot: <><Globe2 aria-hidden className="legal-foot-icon" /> Mitoshi runs on Tempo testnet. It handles no real money.</>,
  },
];
