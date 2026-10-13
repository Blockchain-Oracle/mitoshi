"use client";
// The themes studio's step panels (D-231): 1 Stocks — the lanes, then the stocks whose Windows list on them now (each
// with its issuer's mark; one without a signed source on a lane is offered no tile for it), their weights in whole
// percents; 2 Rule — momentum or reversion with its trigger, or an agent with its brief, posture and the Window lengths
// it reads; 3 Publish — the name, a line, the biggest call, the daily cap and the fee to follow. Owarine 90a91d71's
// DeskStudio grammar (basket choice and weight editor; one signature), on the kit's RadioCards and Sliders.
import { AGENT_POSTURES, BASKET_CADENCES_SEC, formatCadence, type AgentPosture, type BasketLanes } from "@cwf/core";
import { RadioCards, Slider } from "@/components/kit/desk-kit";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { THEMES } from "./copy";
import { companyOf, pct } from "./format";
import { equalWeights, NAME_MAX, BLURB_MAX, offerable, toggleMember, type StudioDraft, type StudioRule } from "./studio";
import type { StudioStock } from "./themes.server";

const S = THEMES.studio;
type Set = (patch: Partial<StudioDraft>) => void;
const LANES: BasketLanes[] = ["regular", "stock24", "both"];

export function StocksStep({ d, set, stocks, problem }: { d: StudioDraft; set: Set; stocks: StudioStock[] | null; problem: string | null }) {
  const offered = (stocks ?? []).filter((s) => offerable(s, d.lanes));
  // A lane change keeps the picks it can still call (re-split only when one has to go: it has no feed on the new lanes).
  const setLanes = (lanes: BasketLanes) => {
    const kept = d.members.filter((m) => (stocks ?? []).some((s) => s.symbol === m.symbol && offerable(s, lanes)));
    set({ lanes, members: kept.length === d.members.length ? d.members : equalWeights(kept.map((m) => m.symbol)) });
  };
  return (
    <div className="th-fields">
      <div className="th-field">
        <span>{S.hours}</span>
        <div className="th-lanes" role="radiogroup" aria-label={S.hours}>
          {LANES.map((value) => (
            <button key={value} type="button" role="radio" aria-checked={d.lanes === value} className="th-lane" onClick={() => setLanes(value)}>{THEMES.lanes[value]}</button>
          ))}
        </div>
        <span className="th-lanes-hint">{S.hoursBody[d.lanes]}</span>
      </div>
      {stocks === null ? <p className="th-problem" role="alert">{S.failed}</p> : offered.length === 0 ? <p className="th-note">{S.noStocks}</p> : null}
      <div className="th-choices" role="group" aria-label={S.pick}>
        {offered.map((s) => (
          <button key={s.symbol} type="button" aria-pressed={d.members.some((m) => m.symbol === s.symbol)} className="th-choice" onClick={() => set({ members: toggleMember(d, s.symbol) })}>
            <AssetDisc asset={s.symbol} className="th-choice-mark" />
            <span className="th-choice-text">
              <span className="th-choice-sym">{s.symbol}</span>
              <span className="th-choice-sub">{companyOf(s.symbol)}</span>
            </span>
          </button>
        ))}
      </div>
      {d.members.length > 0 ? (
        <div className="th-weights">
          <div className="th-weights-head">
            <span className="th-micro">{S.weights}</span>
            <button type="button" onClick={() => set({ members: equalWeights(d.members.map((m) => m.symbol)) })}>{S.equal}</button>
          </div>
          {d.members.map((m) => (
            <div key={m.symbol} className="th-weight">
              <span className="th-weight-sym">
                <AssetDisc asset={m.symbol} className="th-choice-mark" />
                {m.symbol}
              </span>
              <Slider label={S.weight(m.symbol)} value={m.weightBps / 100} min={5} max={95} step={1} display={pct(m.weightBps)} onChange={(v) => set({ members: d.members.map((x) => (x.symbol === m.symbol ? { ...x, weightBps: Math.round(v) * 100 } : x)) })} />
            </div>
          ))}
        </div>
      ) : null}
      {problem ? <p className="th-problem" role="status">{problem}</p> : null}
    </div>
  );
}

const RULES: StudioRule[] = ["momentum", "reversion", "agent"];

export function RuleStep({ d, set, problem }: { d: StudioDraft; set: Set; problem: string | null }) {
  return (
    <div className="th-fields">
      <RadioCards value={d.rule} onChange={(rule) => set({ rule })} label={S.steps.rule} items={RULES.map((value) => ({ value, title: S.rules[value], body: S.rulesBody[value] }))} />
      {d.rule === "agent" ? (
        <>
          <label className="th-field">
            <span>{S.persona}</span>
            <textarea value={d.persona} maxLength={600} placeholder={S.personaHint} onChange={(e) => set({ persona: e.target.value })} />
          </label>
          <RadioCards value={d.posture} onChange={(posture: AgentPosture) => set({ posture })} label={S.posture} items={AGENT_POSTURES.map((value) => ({ value, title: value.charAt(0).toUpperCase() + value.slice(1) }))} />
          <div className="th-choices" role="group" aria-label={S.cadences}>
            {BASKET_CADENCES_SEC.map((c) => (
              <button key={c} type="button" className="th-choice" aria-pressed={d.cadences.includes(c)} onClick={() => set({ cadences: d.cadences.includes(c) ? d.cadences.filter((x) => x !== c) : [...d.cadences, c] })}>
                <span className="th-choice-sym">{formatCadence(c)}</span>
              </button>
            ))}
          </div>
        </>
      ) : (
        <Slider label={S.trigger} value={d.thresholdBps} min={2} max={100} step={1} display={`${(d.thresholdBps / 100).toFixed(2).replace(/\.?0+$/, "")}%`} onChange={(v) => set({ thresholdBps: Math.round(v) })} />
      )}
      {problem ? <p className="th-problem" role="status">{problem}</p> : null}
    </div>
  );
}

function Money({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="th-field">
      <span>{label}</span>
      <input inputMode="decimal" autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function NameStep({ d, set }: { d: StudioDraft; set: Set }) {
  return (
    <div className="th-fields">
      <label className="th-field"><span>{S.name}</span><input value={d.name} maxLength={NAME_MAX} autoComplete="off" onChange={(e) => set({ name: e.target.value })} /></label>
      <label className="th-field"><span>{S.blurb}</span><input value={d.blurb} maxLength={BLURB_MAX} autoComplete="off" onChange={(e) => set({ blurb: e.target.value })} /></label>
      <div className="th-field-pair">
        <Money label={S.perTrade} value={d.perTradeText} onChange={(perTradeText) => set({ perTradeText })} />
        <Money label={S.daily} value={d.dailyText} onChange={(dailyText) => set({ dailyText })} />
      </div>
      <Money label={S.feeText} value={d.feeText} onChange={(feeText) => set({ feeText })} />
    </div>
  );
}
