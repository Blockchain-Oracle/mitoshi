"use client";
// `/themes/create` (S16; R4-11, D-227) on StudioWizard (21st 23576), as Owarine 90a91d71's DeskStudio
// (features/desk/studio: 01 the basket — BasketChoice and WeightEditor with bar and ring; 02 how strict — LimitsForm's
// Careful / Balanced / Loose; then one signature): 1 Stocks — the mirrors the registry lists now (`isEligible`), each with
// its StockReference price, weights in whole percents, the rest in cash, a PartitionBar and Donut preview; 2 Envelope —
// the three presets → each token's band, and its hours (market, plus pre/after, around the clock → sessionsMask);
// 3 Name and fee (≤ 50 bps); 4 Publish — the spec's canonical JSON rides on chain as its data URI,
// `ThemeRegistry.publish` (the creator pays). StudioSide follows every edit from 1024 px.
import { bandAround, isValidCreatorFee, type Envelope, type ThemeSpec, type TxState } from "@cwf/core";
import { invalidateThemes, useEligibleMirrors } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { pillButtonVariants } from "@/components/kit/PillButton";
import { Donut, PartitionBar, RadioCards, Slider } from "@/components/kit/desk-kit";
import { signerOfKind as signerOf, TxCta, TxFailureCard, useTxLifecycle } from "@/components/tx";
import { StudioWizard } from "@/components/ui/wizard-steps";
import { useWalletSession } from "@/lib/wallet-session";
import { THEMES } from "./copy";
import { pct, sliceColor, usd18 } from "./format";
import "@/styles/themes.css";
import "@/components/kit/kit.css";

const S = THEMES.studio;
// ThemeRegistry's MAX_TOKENS; past five a follow is split into one signature per five more stocks (D-100).
const MAX_STOCKS = 16;
/** The theme's sessionsMask (bit s = oracle session s: REGULAR, EXTENDED, CLOSED); UNKNOWN is never offered. */
const HOURS = { market: 0b001, extended: 0b011, always: 0b111 } as const;
type Hours = keyof typeof HOURS;
const idleOr = (state: TxState, blocker: string | null): TxState => (blocker ? { kind: "blocked", reason: blocker } : state);

export function ThemeStudio() {
  const session = useWalletSession();
  const mirrors = useEligibleMirrors();
  const queryClient = useQueryClient();
  const tx = useTxLifecycle();
  const list = mirrors?.ok ? mirrors.value : [];
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [envelope, setEnvelope] = useState<Envelope>("balanced");
  const [hours, setHours] = useState<Hours>("market");
  const [name, setName] = useState("");
  const [blurb, setBlurb] = useState("");
  const [feeBps, setFeeBps] = useState(25);
  const [done, setDone] = useState(false);
  const picked = list.filter((m) => weights[m.symbol] !== undefined);
  const invested = picked.reduce((s, m) => s + weights[m.symbol]!, 0);
  const cashBps = 10_000 - invested;
  const stocksBlocker = picked.length === 0 ? S.pick : cashBps < 0 ? S.over : picked.some((m) => weights[m.symbol]! <= 0) ? S.pick : null;
  const nameBlocker = !name.trim() ? S.needName : !isValidCreatorFee(feeBps) ? S.fee : null;
  const mix = [...picked.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(weights[m.symbol]!)}`, value: weights[m.symbol]!, color: sliceColor(i) })), { id: "cash", label: S.cash(pct(Math.max(0, cashBps))), value: Math.max(0, cashBps), color: "var(--color-surface-3)" }];

  const toggle = (sym: string) =>
    setWeights((w) => {
      const next = { ...w };
      if (next[sym] !== undefined) delete next[sym];
      else if (Object.keys(next).length < MAX_STOCKS) next[sym] = 2_000;
      return next;
    });

  const publish = async () => {
    if (!session.address) return session.connectFor(S.signIn);
    const spec: ThemeSpec = {
      schema: 1, name: name.trim(), blurb: blurb.trim(), creatorFeeBps: feeBps, maxSlippageBps: 100, minIntervalSec: 3_600, maxRefAgeSec: 345_600, sessionsMask: HOURS[hours],
      bands: picked.map((m) => ({ token: m.token, symbol: m.symbol, ...bandAround(weights[m.symbol]!, envelope), allowed: true })),
      cashBand: bandAround(cashBps, envelope),
    };
    const outcome = await tx.run({ kind: "theme-publish", spec, tokens: picked.map((m) => m.token) });
    if (outcome?.status === "confirmed") {
      setDone(true);
      await invalidateThemes(queryClient);
    }
  };

  if (done) {
    return (
      <section className="th-page th-done">
        <h1 className="type-display text-ink">{S.done(name.trim())}</h1>
        <Link href="/themes" className={pillButtonVariants({ tone: "accent", size: "lg", block: true })}>{S.open}</Link>
      </section>
    );
  }

  const side = (
    <aside className="th-side" aria-label={THEMES.theme.target}>
      <Donut slices={mix} label={THEMES.theme.target} size={128} thickness={14}>
        <span className="th-donut-figure numbers">{picked.length}</span>
      </Donut>
      <PartitionBar slices={mix} label={THEMES.theme.target} />
    </aside>
  );

  return (
    <section className="th-page th-studio">
      <h1 className="type-display text-ink">{S.title}</h1>
      <div className="th-studio-grid">
        <StudioWizard
          label={S.title}
          steps={[
            {
              id: "stocks",
              label: S.steps.stocks,
              blocker: stocksBlocker,
              content: (
                <div className="th-fields">
                  <div className="th-choices" role="group" aria-label={S.pick}>
                    {list.map((m) => (
                      <button key={m.symbol} type="button" aria-pressed={weights[m.symbol] !== undefined} className="th-choice" onClick={() => toggle(m.symbol)}>
                        <span className="th-holding-sym">{m.symbol}</span>
                        <span className="numbers type-caption text-ink-secondary">{m.refPriceE18 === null ? S.noPrice : usd18(m.refPriceE18)}</span>
                      </button>
                    ))}
                  </div>
                  {picked.map((m) => (
                    <Slider key={m.symbol} label={S.weight(m.symbol)} value={weights[m.symbol]! / 100} min={1} max={100} step={1} display={pct(weights[m.symbol]!)} onChange={(v) => setWeights((w) => ({ ...w, [m.symbol]: Math.round(v) * 100 }))} />
                  ))}
                  <PartitionBar slices={mix} label={THEMES.theme.target} warn={cashBps < 0} />
                </div>
              ),
            },
            {
              id: "envelope",
              label: S.steps.envelope,
              blocker: null,
              content: (
                <div className="th-fields">
                  <RadioCards value={envelope} onChange={setEnvelope} label={S.steps.envelope} items={(Object.keys(S.envelopes) as Envelope[]).map((value) => ({ value, title: S.envelopes[value], body: S.envelopeBody[value] }))} />
                  <RadioCards value={hours} onChange={setHours} label={S.hours} items={(Object.keys(HOURS) as Hours[]).map((value) => ({ value, title: S.hoursChoice[value], body: S.hoursBody[value] }))} />
                </div>
              ),
            },
            {
              id: "name",
              label: S.steps.name,
              blocker: nameBlocker,
              content: (
                <div className="th-fields">
                  <label className="th-field"><span>{S.name}</span><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" /></label>
                  <label className="th-field"><span>{S.blurb}</span><input value={blurb} maxLength={80} onChange={(e) => setBlurb(e.target.value)} autoComplete="off" /></label>
                  <Slider label={S.fee} value={feeBps} min={0} max={50} step={5} display={pct(feeBps)} onChange={(v) => setFeeBps(Math.round(v))} />
                </div>
              ),
            },
            {
              id: "publish",
              label: S.steps.publish,
              blocker: null,
              content: (
                <div className="th-fields">
                  <PartitionBar slices={mix} label={THEMES.theme.target} />
                  <ul className="th-legend">{mix.map((s) => <li key={s.id}><span aria-hidden style={{ background: s.color }} />{s.label}</li>)}</ul>
                  <TxCta state={idleOr(tx.state, stocksBlocker ?? nameBlocker)} action={session.address ? S.publish : S.signIn} signer={signerOf(session.kind)} onConfirm={() => void publish()} />
                  <p className="type-caption text-ink-secondary">{S.selfPaid}</p>
                  {tx.state.kind === "failed" ? <TxFailureCard state={tx.state} onRetry={() => tx.dispatch({ type: "reset" })} /> : null}
                </div>
              ),
            },
          ]}
        />
        {side}
      </div>
    </section>
  );
}
