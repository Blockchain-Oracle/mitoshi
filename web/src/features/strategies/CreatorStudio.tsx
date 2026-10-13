"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/CreatorStudio.tsx (R4-6, D-227) — the four-step studio on
// Owarine's shell: the numbered rail (01 Identity & approach · 02 Behavior & limits · 03 Test read · 04 Publish, back
// only), the panel beside a sticky preview (a one-line strip on phones), the actions sticky above the dock. checkDraft
// stays the one validator; its reason is the line under Continue. The draft persists per wallet (Owarine DeskStudio).
// Publishing is the root key's (metadata is an SSTORE2 CREATE, D-019), self-paid; an ERC-8004 identity first is
// optional and sponsored (D-218.7). Signed out, Publish opens sign-in for this draft (D-224). After the receipt the
// studio shows the published state, the catalogue's cache tag is expired and the new strategy joins Yours at once.
import { describeSpec, PRESETS, txUrl } from "@cwf/core";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { readReceipt } from "@cwf/markets/react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { decodeEventLog, parseAbi, type Hex } from "viem";
import { TxCta, TxFailureCard } from "@/components/tx";
import { webEnv } from "@/lib/env";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { AgentPortrait } from "./AgentPortrait";
import { DryReadPanel } from "./DryReadPanel";
import { publishedWire } from "./published";
import { STUDIO as T } from "./studio-copy";
import { agentUriOf, checkDraft, EMPTY_DRAFT, specOf, type Draft } from "./studio-draft";
import { StudioForm } from "./StudioForm";
import type { StrategiesPayload } from "./protocol";
import { useDryRead } from "./useDryRead";
import type { CopyWrites } from "./useCopyWrites";
import { rememberPublished, STRATEGIES_KEY, useStrategies } from "./useStrategies";
import "./builder.css";
import "./strategies.css";

const REGISTERED = parseAbi(["event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"]);
const draftKey = (wallet: string | null) => `mitoshi:studio:${wallet?.toLowerCase() ?? "anon"}`;

function idFrom<R>(logs: { topics: Hex[]; data: Hex }[], abi: readonly unknown[], event: string, pick: (args: Record<string, unknown>) => R): R | null {
  for (const l of logs) {
    try {
      const ev = decodeEventLog({ abi: abi as never, data: l.data, topics: l.topics as [Hex, ...Hex[]] }) as unknown as { eventName: string; args: Record<string, unknown> };
      if (ev.eventName === event) return pick(ev.args);
    } catch {
      // another event in the receipt
    }
  }
  return null;
}

function loadDraft(wallet: string | null): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(wallet));
    return raw ? { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<Draft>) } : null;
  } catch {
    return null;
  }
}

export function CreatorStudio({ writes, trader, onYours }: { writes: CopyWrites; trader: string | null; onYours: (strategyId: string) => void }) {
  const catalogue = useStrategies();
  const queryClient = useQueryClient();
  const shell = useWalletShell();
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [agentId, setAgentId] = useState<bigint | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [published, setPublished] = useState<{ id: string; txHash: Hex } | null>(null);
  const loaded = useRef<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const series = catalogue.data?.series ?? [];
  const houseRunner = catalogue.data?.houseRunner ?? null;
  const check = checkDraft(draft, { houseRunner, series });
  const spec = specOf(draft);
  const asset = series.find((s) => s.seriesId === draft.seriesId)?.symbol ?? "the asset";
  const dry = useDryRead(JSON.stringify([draft.persona, draft.posture, draft.cadences, draft.perTradeText, draft.preset]));
  const tested = dry.state.status === "ok" && dry.state.result.verdict !== null;
  const blockers = [check.name, check.steps[1] ?? check.steps[2], null, check.steps[3]] as const;
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";
  const needsIdentity = draft.identity && agentId === null;
  const name = draft.name.trim() || T.namePlaceholder;

  // The wallet's saved draft (or a fresh face), once per wallet. Signing in mid-draft (at Publish) keeps the draft in
  // hand rather than swapping in an older one saved under that wallet.
  useEffect(() => {
    const key = draftKey(writes.wallet);
    if (loaded.current === key) return;
    const fromAnon = loaded.current === draftKey(null);
    loaded.current = key;
    const saved = fromAnon ? null : loadDraft(writes.wallet);
    setDraft((d) => {
      const base = saved ?? d;
      return { ...base, portraitSeed: base.portraitSeed || crypto.randomUUID() };
    });
  }, [writes.wallet]);
  // A profile's "Copy this trader" (`?copy=`): the mirror preset with that wallet in it.
  useEffect(() => {
    if (trader) setDraft((d) => ({ ...d, preset: "mirror", trader }));
  }, [trader]);
  useEffect(() => {
    if (!loaded.current || published) return;
    try {
      window.localStorage.setItem(draftKey(writes.wallet), JSON.stringify(draft));
    } catch {
      // private mode: the draft lives for this visit only
    }
  }, [draft, writes.wallet, published]);
  // The description a copier reads is prefilled from what the runner will do (editable).
  useEffect(() => {
    if (step === 4 && draft.description.trim() === "" && check.spec) set({ description: describeSpec(check.spec, asset).slice(0, 280) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const advance = () => {
    const b = blockers[step - 1];
    if (b) return setProblem(b);
    setProblem(null);
    setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s));
  };
  const testRead = () => {
    if (spec.preset !== "agent" || !check.envelope) return;
    void dry.read({ persona: spec.persona, posture: spec.posture, cadences: spec.cadences, stakeBase: check.envelope.maxStakePerTradeBase.toString() });
  };

  const createIdentity = async () => {
    setProblem(null);
    const outcome = await writes.tx.run({ kind: "agent-register", agentURI: agentUriOf(draft, webEnv.appOrigin || window.location.origin) });
    if (outcome?.status !== "confirmed") return;
    const receipt = await readReceipt(outcome.txHash);
    const id = idFrom(receipt.logs, REGISTERED, "Registered", (a) => a.agentId as bigint);
    if (id !== null) {
      setAgentId(id);
      setProblem(T.registered(id.toString()));
      writes.tx.dispatch({ type: "reset" });
    }
  };

  const publish = async () => {
    if (!check.spec || !check.envelope || !check.runner || !check.metadata) return;
    setProblem(null);
    const outcome = await writes.run({ kind: "strategy-publish", runner: check.runner, spec: check.spec, metadata: check.metadata, envelope: check.envelope, feeBase: check.feeBase, agentId: draft.identity ? agentId : null });
    if (outcome?.status !== "confirmed") return;
    const receipt = await readReceipt(outcome.txHash);
    const id = idFrom(receipt.logs, strategyRegistryAbi, "Published", (a) => (a.strategyId as bigint).toString());
    if (!id) return;
    setPublished({ id, txHash: outcome.txHash });
    try {
      window.localStorage.removeItem(draftKey(writes.wallet));
    } catch {
      // nothing saved
    }
    // The catalogue is "use cache": expire its tag, and list the strategy now from what the receipt confirmed.
    void fetch("/api/strategies/revalidate", { method: "POST" }).catch(() => undefined);
    const wire = publishedWire({ id, creator: writes.wallet ?? "", check, draft, agentId, seriesLabel: series.find((s) => s.seriesId === draft.seriesId)?.label ?? null });
    rememberPublished(wire);
    queryClient.setQueryData<StrategiesPayload>(STRATEGIES_KEY, (p) => (p && !p.strategies.some((s) => s.strategyId === id) ? { ...p, strategies: [wire, ...p.strategies] } : p));
  };

  if (published) return (
    <section className="agent-published" aria-live="polite">
      <AgentPortrait seed={draft.portraitSeed} name={name} />
      <div><p className="strat-micro text-accent">{T.published.eyebrow(published.id)}</p><h2 className="strat-h2 mt-2 text-ink">{name}</h2></div>
      <a className="strat-sensei self-start" href={txUrl(published.txHash, webEnv.markets.network)} target="_blank" rel="noopener noreferrer">{T.published.tx}</a>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="desk-btn-primary" onClick={() => onYours(published.id)}>{T.published.yours}</button>
        <button type="button" className="strat-sensei" onClick={() => { setDraft({ ...EMPTY_DRAFT, portraitSeed: crypto.randomUUID() }); setPublished(null); setAgentId(null); setProblem(null); setStep(1); dry.reset(); writes.tx.dispatch({ type: "reset" }); }}>{T.published.another}</button>
      </div>
    </section>
  );

  const facts: [string, string][] = [
    [T.preview.perTrade, draft.perTradeText ? `$${draft.perTradeText}` : "—"],
    [T.preview.daily, draft.dailyText ? `$${draft.dailyText}` : "—"],
    [T.preview.market, series.find((s) => s.seriesId === draft.seriesId)?.label ?? T.tune.anyWindow],
    [T.preview.test, draft.preset !== "agent" ? T.preview.testRule : tested ? T.preview.testDone : T.preview.testNone],
  ];
  const pct = (draft.thresholdBps / 100).toString();
  const action = step < 4 ? (
    <button type="button" onClick={advance} className="strat-confirm">{step === 3 && draft.preset === "agent" && !tested ? T.nextUntested : T.next}</button>
  ) : !writes.signedIn ? (
    <button type="button" data-primary-action="" className="strat-confirm" onClick={() => shell.openPicker("tempo", `${T.publish.cta(false)} ${name}`)}>{needsIdentity ? T.publish.identityCta : T.publish.cta(draft.identity)}</button>
  ) : blockers[3] ? (
    <button type="button" className="strat-confirm" data-blocked="" aria-disabled onClick={() => setProblem(blockers[3])}>{T.publish.cta(draft.identity)}</button>
  ) : needsIdentity ? (
    <TxCta state={writes.tx.state} action={T.publish.identityCta} signer={writes.signer} sponsored onConfirm={() => void createIdentity()} className="flex-1" />
  ) : (
    <TxCta state={busy ? writes.tx.state : writes.tx.state.kind === "confirmed" ? { kind: "idle" } : writes.tx.state} action={T.publish.cta(draft.identity)} signer={writes.signer} sponsored={false} onConfirm={() => void publish()} className="flex-1" />
  );

  return (
    <section className="agent-builder" aria-label={T.label}>
      <ol className="agent-steps" aria-label={T.label}>
        {T.steps.map((label, i) => (
          <li key={label} aria-current={step === i + 1 ? "step" : undefined}>
            <button type="button" disabled={i + 1 >= step} onClick={() => { setProblem(null); setStep((i + 1) as 1 | 2 | 3 | 4); }}><span>{String(i + 1).padStart(2, "0")}</span>{label}</button>
          </li>
        ))}
      </ol>
      <div className="agent-builder-grid">
        <div className="agent-builder-panel">
          <div className="agent-preview-strip">
            <AgentPortrait seed={draft.portraitSeed || "mitoshi-new"} name={name} size="small" />
            <span className="strat-choice-title truncate text-ink">{name}</span>
            <span className="strat-mono-11 ml-auto shrink-0 text-ink-muted">{PRESETS[draft.preset].name}</span>
          </div>
          {step === 3 ? (
            <div className="flex flex-col gap-4">
              {draft.preset === "agent" ? (
                <>
                  <button type="button" onClick={testRead} disabled={dry.state.status === "reading" || !check.envelope} className="strat-sensei self-start">{dry.state.status === "reading" ? T.test.reading : T.test.run}</button>
                  <DryReadPanel state={dry.state} />
                </>
              ) : (
                <>
                  <p className="strat-micro text-accent">{T.test.rule}</p>
                  <div className="agent-rule-preview">
                    {draft.preset === "mirror" ? <span>{T.test.mirror(draft.trader ? `${draft.trader.slice(0, 6)}…${draft.trader.slice(-4)}` : "—", draft.withinSec)}</span> : draft.preset === "momentum" ? (
                      <><span>{T.test.up(pct)}</span><span>{T.test.down(pct)}</span><span>{T.test.hold}</span></>
                    ) : (
                      <><span>{T.test.up(pct).replace("UP", "DOWN")}</span><span>{T.test.down(pct).replace("DOWN", "UP")}</span><span>{T.test.hold}</span></>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <StudioForm step={step} draft={draft} set={set} series={series} houseRunner={houseRunner} onReroll={() => set({ portraitSeed: crypto.randomUUID() })} />
          )}
          {writes.tx.state.kind === "failed" && step === 4 && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
          <div className="agent-builder-actions">
            {step > 1 && <button type="button" onClick={() => { setProblem(null); setStep((s) => (s - 1) as 1 | 2 | 3); }} className="strat-sensei">{T.back}</button>}
            {action}
            {/* Inside the sticky bar: on a phone the reason stands under the button it explains, never below the fold. */}
            {problem && <p className="agent-form-error" role="status">{problem}</p>}
          </div>
        </div>
        <aside className="strat-preview agent-builder-preview">
          <p className="strat-micro text-ink-muted">{T.preview.eyebrow}</p>
          <div className="mt-4 flex items-center gap-3">
            <AgentPortrait seed={draft.portraitSeed || "mitoshi-new"} name={name} />
            <div className="min-w-0"><h3 className="strat-choice-title break-words text-ink">{name}</h3><p className="strat-mono-11 mt-1 text-ink-muted">{PRESETS[draft.preset].name}</p></div>
          </div>
          <dl className="agent-preview-facts">{facts.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </aside>
      </div>
    </section>
  );
}
