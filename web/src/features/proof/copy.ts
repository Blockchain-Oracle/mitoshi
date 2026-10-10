/**
 * `/proof/<market>` (S5, L-15): the evidence behind each print that settled a Window. Agari 03b30ab's proof copy
 * (`features/proof/copy.ts`) in shape, rewritten for Tempo: RedStone's signed packages in the record transaction's own
 * calldata, the engine's print verifier, and a re-verification you run in this browser with one `eth_call`.
 */
export const PROOF = {
  title: "Print proof",
  intro:
    "Every Window settles on two signed prints. Here is each one, the transaction that recorded it, and a re-verification you can run yourself: this page reads that transaction from Tempo, takes the signed RedStone packages out of its calldata, and asks the engine's print verifier for the price again — the same check the engine made when it recorded the print.",
  window: (asset: string, lane: string, close: string) => `${asset} · ${lane} Window · closes ${close} UTC`,
  unreachable: "The print index is unreachable right now. The prints are still on chain: every record transaction is linked from the Window's receipt.",
  unknown: "No Window with this id is indexed on Tempo testnet.",
  none: "No print recorded for this Window yet. The opening print lands at its start.",
  which: { 0: "Opening print", 1: "Closing print" } as Record<number, string>,
  verdict: {
    title: "Verdict",
    up: "UP won — the close was at or above the open",
    down: "DOWN won — the close was below the open",
    void: "Void — no reliable print in time; both sides returned at half",
    open: "Not settled yet",
  },
  rows: {
    price: "Recorded print",
    boundary: "Boundary",
    signers: "Signers",
    recorded: "Recorded",
    tx: "Record tx",
    settleTx: "Settlement tx",
  },
  copied: "Copied from the previous Window's closing print (the same signed price, recorded once).",
  signerCount: (n: number) => `${n} of RedStone's signers`,
  reverify: "Re-verify in this browser",
  reverifying: "Reading the transaction and asking the verifier…",
  verified: (price: string, n: number) => `Verified now: ${price} from ${n} signers — the same price the engine recorded.`,
  differs: (price: string) => `The verifier answers ${price}, which differs from the recorded print.`,
  failed: (why: string) => `Re-verification didn't complete: ${why}`,
  how: "How: eth_getTransactionByHash → decode recordPrint(market, which, proof) → eth_call verifyPrint(proof, query) on the verifier.",
} as const;
