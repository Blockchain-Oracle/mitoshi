import type { BoundRow } from "./bounds";

/**
 * §02 on a house reserve (Owarine 90a91d71 `ReserveBounds`): the tunables the deployed contract carries, read from the
 * reserve itself — a supplier's only honest guide to what they are taking on; never a projected return.
 */
export function ReserveBounds({ rows, risk }: { rows: readonly BoundRow[]; risk: string }) {
  return (
    <div className="ea-bounds">
      <dl className="ea-bound-rows">
        {rows.map((row) => (
          <div key={row.label} className="ea-bound">
            <dt className="ea-k ea-bound-k">{row.label}</dt>
            <dd className="ea-bound-v">
              <span className="ea-bound-n numbers">{row.value}</span>
              <span className="ea-bound-note">{row.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="ea-risk">{risk}</p>
    </div>
  );
}
