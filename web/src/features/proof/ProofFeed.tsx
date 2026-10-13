// `/proof` (R4-10, D-227) — Ported from Owarine 90a91d71:web/src/features/proof/ProofFeedScreen.tsx: every settled
// Window, newest first, each row opening its print proof — mark, "BTC · 5m", when it closed, open → close prints, the
// outcome. Read on the server from the index (`settledProofs`); nothing when it can't be read but the line that says so.
import { formatCadence } from "@cwf/core/copy";
import Link from "next/link";
import { connection } from "next/server";
import { SectionHeader } from "@/components/kit";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { PROOF } from "./copy";
import { settledProofs, type ProofFeedRow } from "./data";

const usd = (e8: string | null) => (e8 === null ? "—" : `$${(Number(e8) / 1e8).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const utc = (sec: number) => new Date(sec * 1000).toISOString().replace("T", " ").slice(0, 16);
const lane = (cadenceSec: number, basis: number) => (basis === 1 ? "Gap" : `${basis === 2 ? "24/7 " : ""}${formatCadence(cadenceSec)}`);
const outcomeOf = (r: ProofFeedRow) => (r.state === "voided" ? "void" : r.winner === 0 ? "up" : "down");

export async function ProofFeed() {
  await connection();
  const rows = await settledProofs();
  const F = PROOF.feed;
  return (
    <>
      <SectionHeader index="00" title={PROOF.title} desc={F.eyebrow} />
      <div className="status-table">
        {rows === null ? (
          <p className="pf-empty" role="alert">{PROOF.unreachable}</p>
        ) : rows.length === 0 ? (
          <p className="pf-empty">{F.empty}</p>
        ) : (
          <ul className="pf-list">
            {rows.map((r) => {
              const outcome = outcomeOf(r);
              return (
                <li key={r.market} className="pf-row">
                  <AssetDisc asset={r.symbol} className="pf-mark" />
                  <span className="pf-name">
                    <Link href={`/proof/${r.market}`} className="pf-row-link">{`${r.symbol} · ${lane(r.cadenceSec, r.basis)}`}</Link>
                    <span className="pf-when">{`${utc(r.expirySec)} UTC`}</span>
                  </span>
                  <span className="pf-prints">{`${usd(r.openE8)} → ${usd(r.closeE8)}`}</span>
                  <span className="pf-outcome" data-outcome={outcome}>{PROOF.verdict[outcome]}</span>
                  <span className="pf-go" aria-hidden>{F.arrow}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
