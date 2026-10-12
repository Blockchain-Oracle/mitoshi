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
  /** G-10: the same check on the packages ops archived for the instant, apart from the record transaction. */
  archive: {
    button: "Check against the archive",
    checking: "Reading the archive and asking the verifier…",
    matches: (price: string, n: number) => `The archive agrees: ${price} from ${n} signers — the same packages the engine verified.`,
    wouldPrint: (price: string, n: number) => `The archive's packages verify now: ${price} from ${n} signers.`,
    refused: (n: number, reason: string) => `The archive holds ${n} ${n === 1 ? "package" : "packages"} for this instant, and the verifier refuses ${n === 1 ? "it" : "them"}: ${reason}.`,
    missing: "The archive holds no package for this feed at this instant.",
    reasons: {
      InsufficientRedStoneSigners: "too few of RedStone's signers (it needs 3)",
      RedStoneTimestampMismatch: "a package is stamped at another instant",
      FeedIdMismatch: "a package is for another feed",
      UnknownRedStoneSigner: "a signer isn't one of RedStone's",
      DuplicateRedStoneSigner: "a signer appears twice",
      InvalidPrintValue: "the value is out of range",
      SpotTooOld: "the packages are too old",
    } as Record<string, string>,
    missingPrint: (which: string, at: string) => `No ${which.toLowerCase()} was recorded for ${at} UTC.`,
  },
} as const;
