// The hero phone's screen (R6 landing L01; Senryo's LiveHero and Owarine 90a91d71's hero phone as the references): the
// asset and its live price, the Window chip with its ring, the last ten minutes as a line over the dashed opening
// print — the side that is ahead washed in its colour — the status ("UP ahead · +$14.28") and UP / DOWN as links into
// the terminal on that Window, each with what it pays. Never a disabled button: with no Window to call they link to
// the terminal, which shows the same countdown. No hooks: the server draws the first paint with it and the live island
// redraws it on each tick. Sizes are container units (`--hs-u`, 1/390 of the screen), so it scales with the phone.
import type { ReactNode } from "react";
import { WORDS } from "../words";
import { CHART_H, CHART_W, type HeroModel } from "./hero-model";

const P = WORDS.phone;
const pct = (v: number, of: number) => `${((v / of) * 100).toFixed(2)}%`;

function Ring({ fraction }: { fraction: number | null }) {
  const len = 100;
  return (
    <svg className="hs-ring" viewBox="0 0 20 20" aria-hidden focusable="false">
      <circle cx="10" cy="10" r="8" pathLength={len} className="hs-ring-track" />
      {fraction !== null ? <circle cx="10" cy="10" r="8" pathLength={len} strokeDasharray={`${(fraction * len).toFixed(1)} ${len}`} className="hs-ring-left" /> : null}
    </svg>
  );
}

function StatusBar() {
  return (
    <div className="hs-bar" aria-hidden>
      <span>9:41</span>
      <span className="hs-bar-icons">
        <svg viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5" width="3" height="7" rx="1" /><rect x="10" y="2.5" width="3" height="9.5" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
        <svg viewBox="0 0 24 12"><rect x="0.5" y="0.5" width="20" height="11" rx="3" className="hs-batt-case" /><rect x="2" y="2" width="17" height="8" rx="1.8" /><rect x="21.5" y="4" width="2" height="4" rx="1" /></svg>
      </span>
    </div>
  );
}

export function HeroScreen({ m, disc }: { m: HeroModel; disc: ReactNode }) {
  const geo = m.geo;
  const openY = geo?.openY ?? null;
  return (
    <div className="hs" data-hero-state={m.state} aria-label={P.screen}>
      <StatusBar />
      <div className="hs-head">
        {disc}
        <div className="hs-price">
          <b data-stale={m.state === "stale" || undefined}>{m.priceText ?? "—"}</b>
          <span>
            {m.symbol} · <i className="hs-dot" aria-hidden /> {m.state === "stale" ? P.reconnecting : P.live}
          </span>
        </div>
        <span className="hs-chip">
          <Ring fraction={m.fraction} />
          {m.chip}
        </span>
      </div>

      <div className="hs-chart" aria-hidden>
        <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" focusable="false">
          {openY !== null ? (
            <>
              <rect x="0" y="0" width={CHART_W} height={Math.max(0, openY)} className="hs-wash-up" />
              <rect x="0" y={openY} width={CHART_W} height={Math.max(0, CHART_H - openY)} className="hs-wash-down" />
              <line x1="0" x2={CHART_W} y1={openY} y2={openY} className="hs-open" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
          {geo?.d ? <path d={geo.d} className="hs-line" vectorEffect="non-scaling-stroke" /> : null}
        </svg>
        {geo?.labels.map(([v, y]) => (
          <span key={y} className="hs-ylabel" style={{ top: pct(y, CHART_H) }}>
            {Math.round(v).toLocaleString("en-US")}
          </span>
        ))}
        {openY !== null && m.openText ? (
          <span className="hs-open-tag" style={{ top: pct(openY, CHART_H) }}>
            {m.openText}
          </span>
        ) : null}
        {geo?.last ? <span className="hs-head-dot" style={{ left: pct(geo.last.x, CHART_W), top: pct(geo.last.y, CHART_H) }} /> : null}
      </div>

      <p className="hs-status" data-tone={m.status?.tone}>
        {m.status?.text ?? " "}
      </p>
      <div className="hs-sides">
        {(["up", "down"] as const).map((side) => {
          const s = m[side];
          return (
            <a key={side} href={s.href} className="hs-side" data-side={side} aria-label={s.label}>
              <b>{side === "up" ? "UP" : "DOWN"}</b>
              <span>{s.pays ? P.pays(s.pays) : P.next}</span>
            </a>
          );
        })}
      </div>
      <span className="hs-home" aria-hidden />
    </div>
  );
}

/** The screen before the server's read lands (≤ 900 ms): its outline in bones, no buttons yet. */
export function HeroScreenWait() {
  return (
    <div className="hs" data-hero-state="wait" aria-hidden>
      <StatusBar />
      <div className="hs-head">
        <span className="skel hs-bone-disc" />
        <span className="skel hs-bone-price" />
        <span className="skel hs-bone-chip" />
      </div>
      <div className="hs-chart">
        <span className="skel hs-bone-line" />
      </div>
      <div className="hs-sides">
        <span className="skel hs-bone-side" />
        <span className="skel hs-bone-side" />
      </div>
    </div>
  );
}
