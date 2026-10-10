// `/proof/<market>` (S5, L-15; Agari 03b30ab `features/proof/ProofScreen.tsx`'s order: the Window, its verdict, its
// prints, one receipt per print) on Mitoshi's tokens: each print's value, boundary, signers and record transaction,
// with a re-verification run in the browser (`ReverifyButton`). Read per request from the indexer.
import { connection } from "next/server";
import { formatCadence } from "@cwf/core/copy";
import { TEMPO_RPC_HTTP, txUrl } from "@cwf/core";
import { A, Code, H1, H2, Lead, Note, P, Table } from "@/features/docs/Prose";
import { PROOF } from "./copy";
import { readProof } from "./data";
import { ReverifyButton } from "./ReverifyButton";

const utc = (sec: number) => new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 19);
const usd = (e8: string) => `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`;
const lane = (cadenceSec: number, basis: number) => (basis === 1 ? "Gap" : `${basis === 2 ? "24/7 " : ""}${formatCadence(cadenceSec)}`);
const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

export async function ProofScreen({ market }: { market: `0x${string}` }) {
  await connection();
  const w = await readProof(market);
  if (w === null) return <Note>{PROOF.unreachable}</Note>;
  if (w === "unknown") return <Note>{PROOF.unknown}</Note>;
  const verdict = w.state === "voided" ? PROOF.verdict.void : w.state === "resolved" ? (w.winner === 0 ? PROOF.verdict.up : PROOF.verdict.down) : PROOF.verdict.open;
  return (
    <>
      <H1>{PROOF.title}</H1>
      <Lead>{PROOF.window(w.symbol, lane(w.cadenceSec, w.basis), utc(w.expirySec))}</Lead>
      <P>{PROOF.intro}</P>
      <H2>{PROOF.verdict.title}</H2>
      <P>
        <b>{verdict}</b>
        {w.resolvedTx ? <> · {PROOF.rows.settleTx}: <A href={txUrl(w.resolvedTx, "testnet")}><Code>{short(w.resolvedTx)}</Code></A></> : null}
      </P>
      {w.prints.length === 0 ? <Note>{PROOF.none}</Note> : null}
      {w.prints.map((p) => (
        <section key={p.which} className="flex flex-col gap-4">
          <H2>{PROOF.which[p.which] ?? `Print ${p.which}`}</H2>
          <Table
            head={["", ""]}
            rows={[
              [PROOF.rows.price, <b key="p">{usd(p.priceE8)}</b>],
              [PROOF.rows.boundary, `${utc(p.sourceTsSec)} UTC`],
              [PROOF.rows.signers, PROOF.signerCount(p.signers)],
              [PROOF.rows.recorded, `${utc(p.recordedTsSec)} UTC`],
              [PROOF.rows.tx, p.txHash ? <A key="t" href={txUrl(p.txHash, "testnet")}><Code>{short(p.txHash)}</Code></A> : "—"],
            ]}
          />
          {p.copied ? (
            <Note>{PROOF.copied}</Note>
          ) : p.txHash && w.feed && w.verifier ? (
            <ReverifyButton expectedE8={p.priceE8} input={{ rpcUrl: TEMPO_RPC_HTTP.testnet, txHash: p.txHash, market: w.market, which: p.which, feed: w.feed, t: p.sourceTsSec, verifier: w.verifier }} />
          ) : null}
        </section>
      ))}
    </>
  );
}
