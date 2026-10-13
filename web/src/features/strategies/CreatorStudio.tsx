"use client";
// Ported in role from Agari 03b30ab:web/src/features/strategies/CreatorStudio.tsx — the builder as the 21st 23576 wizard
// (instinct → tune → hard limits → name and publish). Publishing is the root key's (metadata is an SSTORE2 CREATE,
// D-019) and self-paid; an ERC-8004 identity first is optional and sponsored (D-218.7), its id read off the receipt.
import { decodeEventLog, parseAbi, type Hex } from "viem";
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { readReceipt } from "@cwf/markets/react";
import { useState } from "react";
import { TxCta, TxFailureCard } from "@/components/tx";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { webEnv } from "@/lib/env";
import { InstinctStep, Labelled, LimitsStep, TuneStep } from "./StudioSteps";
import { STUDIO as T } from "./studio-copy";
import { agentUriOf, checkDraft, DESCRIPTION_MAX, EMPTY_DRAFT, NAME_MAX, type Draft } from "./studio-draft";
import { StudioWizard } from "./StudioWizard";
import type { CopyWrites } from "./useCopyWrites";
import { useStrategies } from "./useStrategies";

const REGISTERED = parseAbi(["event Registered(uint256 indexed agentId, string agentURI, address indexed owner)"]);

function idFrom<T>(logs: { topics: Hex[]; data: Hex }[], abi: readonly unknown[], event: string, pick: (args: Record<string, unknown>) => T): T | null {
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

/** `initial` seeds the draft: a profile's "Copy this trader" opens the mirror preset on that wallet (R4-10, D-227). */
export function CreatorStudio({ writes, onPublished, initial }: { writes: CopyWrites; onPublished: (strategyId: string) => void; initial?: Partial<Draft> }) {
  const catalogue = useStrategies();
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY_DRAFT, ...initial }));
  const [agentId, setAgentId] = useState<bigint | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const series = catalogue.data?.series ?? [];
  const check = checkDraft(draft, { houseRunner: catalogue.data?.houseRunner ?? null, series });
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";
  const needsIdentity = draft.identity && agentId === null;

  const createIdentity = async () => {
    setSaid(null);
    const outcome = await writes.tx.run({ kind: "agent-register", agentURI: agentUriOf(draft, webEnv.appOrigin || window.location.origin) });
    if (outcome?.status !== "confirmed") return;
    const receipt = await readReceipt(outcome.txHash);
    const id = idFrom(receipt.logs, REGISTERED, "Registered", (a) => a.agentId as bigint);
    if (id !== null) {
      setAgentId(id);
      setSaid(T.publish.registered(id.toString()));
      writes.tx.dispatch({ type: "reset" });
    }
  };

  const publish = async () => {
    if (!check.spec || !check.envelope || !check.runner || !check.metadata) return;
    setSaid(null);
    const outcome = await writes.run({ kind: "strategy-publish", runner: check.runner, spec: check.spec, metadata: check.metadata, envelope: check.envelope, feeBase: check.feeBase, agentId: draft.identity ? agentId : null });
    if (outcome?.status !== "confirmed") return;
    const receipt = await readReceipt(outcome.txHash);
    const id = idFrom(receipt.logs, strategyRegistryAbi, "Published", (a) => (a.strategyId as bigint).toString());
    if (id) {
      setSaid(T.publish.published(id));
      onPublished(id);
    }
  };

  const publishStep = (
    <div className="flex flex-col gap-4">
      <Labelled id="studio-name" label={T.publish.name} help={`${draft.name.length}/${NAME_MAX}`}>
        <Input id="studio-name" value={draft.name} maxLength={NAME_MAX} onChange={(e) => set({ name: e.target.value })} className="min-h-touch" />
      </Labelled>
      <Labelled id="studio-description" label={T.publish.description} help={`${draft.description.length}/${DESCRIPTION_MAX}`}>
        <Input id="studio-description" value={draft.description} maxLength={DESCRIPTION_MAX} onChange={(e) => set({ description: e.target.value })} className="min-h-touch" />
      </Labelled>
      <SegmentedControl label={T.publish.runner} options={T.publish.runners} value={draft.runner} onValueChange={(runner) => set({ runner })} />
      <span className="type-caption text-ink-secondary">{draft.runner === "house" ? T.publish.houseHelp : T.publish.ownHelp}</span>
      {draft.runner === "own" && (
        <Labelled id="studio-own-runner" label={T.publish.ownRunner}>
          <Input id="studio-own-runner" value={draft.ownRunner} placeholder="0x…" spellCheck={false} onChange={(e) => set({ ownRunner: e.target.value })} className="min-h-touch font-mono" />
        </Labelled>
      )}
      <label className="flex items-start justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <span className="type-body-strong text-ink">{T.publish.identity}</span>
          <span className="type-caption text-ink-secondary">{T.publish.identityHelp}</span>
        </span>
        <Switch checked={draft.identity} disabled={agentId !== null} onCheckedChange={(identity) => set({ identity })} />
      </label>
      {check.envelope && <p className="type-body text-ink-secondary">{T.publish.summary(check.envelope.maxStakePerTradeBase, check.envelope.maxDailySpendBase, check.feeBase)}</p>}
      <p className="type-caption text-ink-secondary">{T.publish.rootNote}</p>
      {said && <p role="status" className="type-body-strong text-ink">{said}</p>}
      {writes.tx.state.kind === "failed" && <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} />}
      {!writes.signedIn ? (
        <button type="button" onClick={writes.connect} className="min-h-touch rounded-full bg-accent-fill px-6 type-body-strong text-on-accent">{"Sign in to publish"}</button>
      ) : check.steps.some((s) => s !== null) ? (
        <p role="status" className="type-body-strong text-ink-secondary">{check.steps.find((s) => s !== null)}</p>
      ) : needsIdentity ? (
        <div className="flex flex-col gap-1">
          <span className="type-caption text-ink-secondary">{T.publish.signsIdentity}</span>
          <TxCta state={writes.tx.state} action={T.publish.identityCta} signer={writes.signer} sponsored onConfirm={() => void createIdentity()} />
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="type-caption text-ink-secondary">{T.publish.signsPublish(draft.identity)}</span>
          <TxCta state={busy ? writes.tx.state : writes.tx.state.kind === "confirmed" ? { kind: "idle" } : writes.tx.state} action={T.publish.cta} signer={writes.signer} sponsored={false} onConfirm={() => void publish()} />
        </div>
      )}
    </div>
  );

  return (
    <StudioWizard
      label={T.label}
      steps={[
        { id: "instinct", label: T.steps.instinct, content: <InstinctStep draft={draft} set={set} />, blocker: check.steps[0] },
        { id: "tune", label: T.steps.tune, content: <TuneStep draft={draft} set={set} series={series} />, blocker: check.steps[1] },
        { id: "limits", label: T.steps.limits, content: <LimitsStep draft={draft} set={set} />, blocker: check.steps[2] },
        { id: "publish", label: T.steps.publish, content: publishStep, blocker: check.steps[3] },
      ]}
    />
  );
}
