// /terms' sections (R4-13a, D-227: LegalScreen's cards, one per former heading, each with a one-line gist; the points
// keep the page's text in substance): the testnet terms of use, in plain words.
import { Bot, Coins, MessagesSquare, Scale, ShieldAlert } from "lucide-react";
import type { LegalSection } from "./LegalAccordion";

export const TERMS_SECTIONS: readonly LegalSection[] = [
  {
    id: "testnet", title: "Testnet only", gist: "Faucet pathUSD. No value, no real money.", icon: <Coins />,
    points: [
      <>The money on Mitoshi is testnet pathUSD from a faucet. It has no value, can&apos;t be bought or sold, and nothing here wins or loses real money.</>,
      <>Testnets get reset and upgraded; balances and positions there may disappear.</>,
      <>Nothing on Mitoshi is investment, financial or legal advice.</>,
    ],
  },
  {
    id: "fair", title: "Using it fairly", gist: "Respect the limits; your passkey is yours to keep.", icon: <Scale />,
    points: [
      <>Don&apos;t abuse the faucet or the fee relay, or try to take more than its limits allow.</>,
      <>Some markets aren&apos;t available in some regions, and Mitoshi may keep them closed where the law requires.</>,
      <>You are responsible for your device and your passkey; an account whose passkey is lost can&apos;t be recovered.</>,
    ],
  },
  {
    id: "posts", title: "What you post", gist: "Public, yours, and no spam, abuse or scams.", icon: <MessagesSquare />,
    points: [
      <>Rooms, takes, profiles and reactions are public. No spam, abuse, scams, impersonation or anything illegal; no one else&apos;s private information.</>,
      <>Anyone can report a post or profile and block a person. A moderator may hide what breaks these rules; repeated abuse can lose the right to post.</>,
      <>What you write stays yours. Posting it lets Mitoshi store it and show it to others, until you delete it.</>,
      <>A take is a call said out loud, not a trade and not advice. Nothing trades from a post.</>,
    ],
  },
  {
    id: "sensei", title: "Sensei", gist: "An AI that can be wrong and never trades for you.", icon: <Bot />,
    points: [
      <>Sensei is an AI model reading the figures on your screen. It can be wrong, it never trades for you, and nothing it says is financial advice.</>,
      <>It sends your questions to an AI provider only after you agree to the one it names.</>,
    ],
  },
  {
    id: "warranty", title: "No warranty", gist: "Provided as is; the beta may change or end.", icon: <ShieldAlert />,
    points: [
      <>Mitoshi and its contracts are provided as they are. Software and oracles can fail; a Window without a reliable print is voided at half, and other failures may happen.</>,
      <>Mitoshi may change, pause or end the beta at any time.</>,
    ],
  },
];
