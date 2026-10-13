/** The legal frame's own words (R4-13a, D-227; Owarine 90a91d71:web/src/features/legal/copy.ts's frame). */
export const LEGAL = {
  sticker: "TESTNET",
  contact: { label: "Questions?", text: "Contact" },
  privacy: { heading: "Privacy", lede: "As little as it takes to sign you in and keep it fair.", facts: ["No ads", "No trackers", "Delete any time"] },
  terms: { heading: "Terms", lede: "A beta on Tempo testnet. Using it means accepting these.", facts: ["Test money only", "Not advice", "As is"] },
} as const;
