"use client";
// Tradash's TP/SL sheet (`sV`, RV-51/23e) as a right-edge drawer (D-190), on Mitoshi's definition (D-197, D-200): a
// take-profit and a stop-loss on what Close pays, which the open tab closes the position at with the one-tap Close.
// Tradash's grammar: the ROI % · Change % · P&L tabs; a card each with a trigger price linked to the tab's value and
// Clear; the "Closes at … for …" caption; its validation (`sq`) in exit-value terms; the trailing-stop note. A trigger
// price is a spot on the fair model ("≈"). A Trading Balance position can hand them to Mitoshi's exit keeper (S24.5,
// D-193): one passkey confirmation grants EXIT, then every Set is signed by the session key and runs with the app
// closed; otherwise they run only while Mitoshi is open, and need a key that signs without a prompt until the Window
// closes.
import type { VaultGrant } from "@cwf/core";
import { diagnosisCopy } from "@cwf/core/copy";
import { useState } from "react";
import { useTxLifecycle } from "@/components/tx/useTxLifecycle";
import { useSessionActions, useSessionView } from "@/features/session";
import { exitAllowanceText } from "@/features/session/caps";
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { tapFeedback } from "@/lib/feedback";
import { notify } from "@/lib/toast";
import { formatUsd, priceDecimals } from "../chart/engine";
import { TERMINAL } from "../copy";
import { setExits } from "../entries";
import { EXIT_MODES, exitCaption, exitError, modeText, priceText, targetFromMode, targetFromPrice, type ExitCtx, type ExitKind, type ExitMode } from "../exits-form";
import { money, sideWord } from "../format";
import type { TerminalPosition } from "../terminal-positions";
import { EXIT_GRANT_SEC, EXIT_SLACK_BPS, EXIT_TOLERANCE_BPS, serverExitState, useExitKeeper, useServerExit, writeServerExit, type ServerExitState } from "../server-exits";
import { tradeSettings } from "../settings";
import type { PositionValue } from "../usePositionValue";
import { unattendedRefusal, useSignerLasts } from "../useTrail";

const PRESETS: Record<ExitKind, readonly number[]> = { tp: [25, 50, 100], sl: [-25, -50, -75] };
const none = () => null;
const usd = (spot: number) => formatUsd(spot, priceDecimals(spot));

type Edit = { field: "price" | "mode"; text: string } | null;

function ExitCard({ kind, mode, base, onBase, ctx, asset }: { kind: ExitKind; mode: ExitMode; base: bigint | null; onBase: (b: bigint | null) => void; ctx: ExitCtx; asset: string }) {
  // The field being typed in keeps its text; the other follows the target live.
  const [edit, setEdit] = useState<Edit>(null);
  const typed = edit !== null && edit.text.trim() !== "";
  const error = exitError(kind, base, typed, ctx);
  const label = kind === "tp" ? TERMINAL.exits.tp : TERMINAL.exits.sl;
  const type = (field: "price" | "mode", text: string) => {
    setEdit({ field, text });
    onBase(field === "price" ? targetFromPrice(text, ctx) : targetFromMode(mode, text, ctx));
  };
  const pick = (b: bigint | null) => (tapFeedback(), setEdit(null), onBase(b));
  return (
    <div className="tm-card tm-exit-card" role="group" aria-label={label} data-kind={kind}>
      <div className="tm-field-head">
        <span>{label}</span>
        <button type="button" className="tm-choice" disabled={base === null && !typed} onClick={() => pick(null)}>{TERMINAL.exits.clear}</button>
      </div>
      <div className="tm-exit-inputs">
        <label className="tm-exit-input">
          <span>{TERMINAL.exits.trigger(asset)}</span>
          <input className="tm-input" inputMode="decimal" placeholder="—" value={edit?.field === "price" ? edit.text : priceText(base, ctx)} onChange={(e) => type("price", e.target.value)} onBlur={() => base !== null && setEdit(null)} />
        </label>
        <label className="tm-exit-input">
          <span>{TERMINAL.exits.modes[mode]}</span>
          <input className="tm-input" inputMode="decimal" placeholder={kind === "tp" ? "0" : "-0"} value={edit?.field === "mode" ? edit.text : modeText(mode, base, ctx)} onChange={(e) => type("mode", e.target.value)} onBlur={() => base !== null && setEdit(null)} />
        </label>
      </div>
      {mode === "roi" ? (
        <div className="tm-choices">
          {PRESETS[kind].map((pct) => {
            const b = targetFromMode("roi", String(pct), ctx);
            return <button key={pct} type="button" className="tm-choice" aria-pressed={b !== null && base === b} onClick={() => pick(b)}>{TERMINAL.exits.roi(pct)}</button>;
          })}
        </div>
      ) : null}
      <p className={error ? "tm-field-error" : "tm-field-hint"} role={error ? "alert" : undefined}>{error ?? exitCaption(kind, base, ctx)}</p>
    </div>
  );
}

/** Where these exits run: with the app closed (the keeper), after one confirmation, or only in this tab. */
function KeeperRow({ state, grant, waiting, onGrant, granting }: { state: ServerExitState; grant: VaultGrant | null; waiting: string | null; onGrant: () => void; granting: boolean }) {
  if (state === "unavailable") return <p className="tm-field-hint">{TERMINAL.keeper.tabOnly}</p>;
  if (state === "live")
    return (
      <>
        <p className="tm-field-hint" data-keeper="live">{TERMINAL.keeper.runs(exitAllowanceText(grant?.exitToleranceBps ?? EXIT_TOLERANCE_BPS, grant?.exitSlackBps))}</p>
        {waiting ? <p className="tm-field-hint" role="status">{TERMINAL.keeper.waiting(waiting)}</p> : null}
      </>
    );
  return (
    <div className="tm-card tm-exit-card" data-keeper="needs-grant">
      <p className="tm-field-hint">{TERMINAL.keeper.turnOnBody(exitAllowanceText(EXIT_TOLERANCE_BPS, EXIT_SLACK_BPS))}</p>
      <button type="button" className="tm-choice" disabled={granting} onClick={onGrant}>{granting ? TERMINAL.keeper.turningOn : TERMINAL.keeper.turnOn}</button>
    </div>
  );
}

function ExitsForm({ p, value, onDone }: { p: TerminalPosition; value: PositionValue | null; onDone: () => void }) {
  const lasts = useSignerLasts();
  const view = useSessionView();
  const actions = useSessionActions();
  const keeper = useExitKeeper();
  const tx = useTxLifecycle();
  const [granting, setGranting] = useState(false);
  const keeperState = serverExitState(p, view, keeper);
  const held = useServerExit(p.marketId, p.side);
  // The one passkey confirmation (root-signed, never sponsored): the keeper may sell at the floor until it expires.
  const grant = async () => {
    if (!keeper) return;
    tapFeedback();
    setGranting(true);
    const outcome = await tx.run({ kind: "vault-grant-exit", actor: keeper, market: null, expiresAtSec: Math.floor(Date.now() / 1000) + EXIT_GRANT_SEC, toleranceBps: EXIT_TOLERANCE_BPS, slackBps: EXIT_SLACK_BPS });
    setGranting(false);
    const id = `keeper-${p.marketId}`;
    if (outcome?.status === "confirmed") {
      await actions.refresh();
      notify.item({ id, title: TERMINAL.keeper.on, description: TERMINAL.keeper.onBody });
    } else if (outcome) notify.item({ id, type: "warning", title: TERMINAL.keeper.failed, description: "diagnosis" in outcome ? diagnosisCopy(outcome.diagnosis.kind).headline : undefined });
  };
  const [mode, setMode] = useState<ExitMode>("roi");
  // Seeded once per opening (the drawer's content unmounts on close), so a positions refresh never resets an edit.
  const [tp, setTp] = useState(p.tpBase);
  const [sl, setSl] = useState(p.slBase);
  const ctx: ExitCtx = { costBase: p.costBase, maxBase: p.heldRaw, nowBase: value?.valueBase ?? null, refSpot: p.entrySpot ?? value?.spot ?? null, valueAt: value?.valueAt ?? none, spotAt: value?.spotAt ?? none };
  const blocked = exitError("tp", tp, false, ctx) !== null || exitError("sl", sl, false, ctx) !== null;
  const save = async () => {
    tapFeedback();
    const id = `exits-${p.marketId}`;
    // The keeper sells under the EXIT grant: only the tab's own Close needs a key that lasts the Window.
    if ((tp !== null || sl !== null) && keeperState !== "live" && !lasts(p)) return void notify.item({ id, type: "warning", ...unattendedRefusal(p) });
    setExits(p.entryKey, p.side, { tpBase: tp, slBase: sl }, value?.spot ?? p.entrySpot ?? 0);
    if (keeperState === "live") {
      const trail = p.trailStop !== null;
      const why = await writeServerExit(p, { takeProfitBase: tp, stopLossBase: sl, trailBps: trail ? Math.round(tradeSettings().trailPct * 10_000) : null, trailStopE8: trail ? BigInt(Math.round(p.trailStop! * 1e8)) : null }, view, actions.signExit);
      if (why) notify.item({ id: `${id}-keeper`, type: "warning", title: TERMINAL.keeper.notStored(p.asset), description: TERMINAL.keeper.notStoredBody(why) });
    }
    notify.item({ id, title: TERMINAL.exits.saved(p.asset), description: [tp !== null ? TERMINAL.exits.when(TERMINAL.exits.tp, `≥ ${money(tp)}`) : null, sl !== null ? TERMINAL.exits.when(TERMINAL.exits.sl, `≤ ${money(sl)}`) : null].filter(Boolean).join(" · ") || TERMINAL.exits.off });
    onDone();
  };
  const hint = TERMINAL.exits.modeHints;
  return (
    <>
      <p className="tm-field-hint">{TERMINAL.exits.head(sideWord(p.side), p.asset, money(p.costBase), p.entrySpot ? usd(p.entrySpot) : null)}</p>
      {value?.valueBase != null ? <p className="tm-field-hint">{TERMINAL.exits.now(`${value.approx ? "≈ " : ""}${money(value.valueBase)}`)}</p> : null}
      <div className="tm-tabs" role="tablist" aria-label={TERMINAL.exits.open}>
        {EXIT_MODES.map((m) => (
          <button key={m} type="button" role="tab" className="tm-choice" aria-selected={mode === m} onClick={() => (tapFeedback(), setMode(m))}>{TERMINAL.exits.modes[m]}</button>
        ))}
      </div>
      <p className="tm-field-hint">{mode === "change" ? hint.change(p.asset, p.entrySpot === null) : hint[mode]}</p>
      <ExitCard kind="tp" mode={mode} base={tp} onBase={setTp} ctx={ctx} asset={p.asset} />
      <ExitCard kind="sl" mode={mode} base={sl} onBase={setSl} ctx={ctx} asset={p.asset} />
      {p.trailStop !== null ? <p className="tm-field-hint">{TERMINAL.exits.trailing(usd(p.trailStop))}</p> : null}
      <KeeperRow state={keeperState} grant={view.exitGrant ?? null} waiting={held?.status === "armed" ? held.lastError : null} onGrant={() => void grant()} granting={granting} />
      <button type="button" className="tm-btn tm-btn-cta" disabled={blocked} onClick={() => void save()}>{TERMINAL.exits.save}</button>
    </>
  );
}

export function ExitsDrawer({ p, value, open, onOpenChange }: { p: TerminalPosition | null; value: PositionValue | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  if (!p) return null;
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title={TERMINAL.exits.title(sideWord(p.side), p.asset)} description={TERMINAL.exits.body}>
        <ExitsForm key={p.id} p={p} value={value} onDone={() => onOpenChange(false)} />
      </SlideOverContent>
    </SlideOver>
  );
}
