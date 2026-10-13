"use client";
// `/themes/create` (S16; R6, D-230; D-231) on StudioWizard (21st 23576), as Owarine 90a91d71's DeskStudio: 1 Stocks
// (the lanes, then the stocks whose Windows list on them now — read by the server with the page — and their weights),
// 2 Rule, 3 Publish — one `strategy-publish` of a `basket` spec the house runner calls (the creator pays; the metadata
// is an SSTORE2 write), then the new theme from its receipt with the way to it. Signed out, Publish opens sign-in for
// this theme (sign-in at the end, D-224). The side panel follows every edit from 1024 px: the ring, the bar and the
// pick's three months as a weighted mix (ops' daily closes), the line its page will draw. Refero: Acorns' recommended
// portfolio (e2bd5833-b4cc-4e5f-8bd9-d96cea0dc7cb — the mix as one ring, the count in its hole) for the side panel.
import { strategyRegistryAbi } from "@cwf/clients/abis/StrategyRegistry";
import { readReceipt } from "@cwf/markets/react";
import { CircleCheck } from "lucide-react";
import { Suspense, use, useState } from "react";
import { decodeEventLog, type Hex } from "viem";
import { Donut, PartitionBar } from "@/components/kit/desk-kit";
import { EmptyState } from "@/components/states/EmptyState";
import { TxCta, TxFailureCard } from "@/components/tx";
import { StudioWizard } from "@/components/ui/wizard-steps";
import { useCopyWrites } from "@/features/strategies/useCopyWrites";
import { useWalletShell } from "@/providers/wallet/wallet-shell-context";
import { THEMES } from "./copy";
import { pct, signedPct, sliceColor, toneOf } from "./format";
import { useThemesRefresh } from "./live";
import { mixMoveBps, mixSeries, rangeStart, type Candle } from "./mix";
import { MixSpark } from "./spark";
import { checkStudio, EMPTY_STUDIO, type StudioDraft } from "./studio";
import { NameStep, RuleStep, StocksStep } from "./StudioSteps";
import type { StudioStock } from "./themes.server";
import "@/styles/themes.css";
import "@/styles/themes-detail.css";

const S = THEMES.studio;
const PREVIEW_DAYS = 90;

/** The strategy id a publish receipt's `Published` event carries. */
function publishedId(logs: { topics: Hex[]; data: Hex }[]): string | null {
  for (const l of logs) {
    try {
      const ev = decodeEventLog({ abi: strategyRegistryAbi, data: l.data, topics: l.topics as [Hex, ...Hex[]] }) as unknown as { eventName: string; args: { strategyId?: bigint } };
      if (ev.eventName === "Published" && ev.args.strategyId !== undefined) return ev.args.strategyId.toString();
    } catch {
      // another contract's event in the receipt
    }
  }
  return null;
}

/** The pick's three months: the weighted mix over ops' daily closes; a stock without closes draws nothing. */
function Preview({ daily, d }: { daily: Promise<Record<string, Candle[] | null>>; d: StudioDraft }) {
  const candles = use(daily);
  if (d.members.length === 0) return <p className="th-preview-note">{S.previewNone}</p>;
  const line = mixSeries(d.members, candles, rangeStart(Date.now(), PREVIEW_DAYS));
  const move = mixMoveBps(line.points);
  return (
    <div className="th-preview">
      <span className="th-micro">{S.preview}</span>
      <span className="th-card-move numbers" data-tone={toneOf(move)}>{move === null ? "—" : signedPct(move)}</span>
      {line.points.length >= 2 ? <MixSpark points={line.points} moveBps={move} id="studio" /> : <p className="th-preview-note">{line.missing.length ? THEMES.theme.noChart(line.missing.join(", ")) : THEMES.theme.flat}</p>}
    </div>
  );
}

export function ThemeStudio({ stocks, houseRunner, daily }: { stocks: StudioStock[] | null; houseRunner: string | null; daily: Promise<Record<string, Candle[] | null>> }) {
  const writes = useCopyWrites();
  const shell = useWalletShell();
  const refresh = useThemesRefresh();
  const [d, setDraft] = useState<StudioDraft>(EMPTY_STUDIO);
  const [published, setPublished] = useState<{ id: string | null; name: string } | null>(null);
  const set = (patch: Partial<StudioDraft>) => setDraft((x) => ({ ...x, ...patch }));
  const check = checkStudio(d, { houseRunner });
  const slices = d.members.map((m, i) => ({ id: m.symbol, label: `${m.symbol} ${pct(m.weightBps)}`, value: m.weightBps, color: sliceColor(i) }));
  const busy = writes.tx.state.kind === "signing" || writes.tx.state.kind === "submitted";

  const publish = async () => {
    if (!check.spec || !check.envelope || !check.metadata || !houseRunner) return;
    const outcome = await writes.run({ kind: "strategy-publish", runner: houseRunner as `0x${string}`, spec: check.spec, metadata: check.metadata, envelope: check.envelope, feeBase: check.feeBase, agentId: null });
    if (outcome?.status !== "confirmed") return;
    const receipt = await readReceipt(outcome.txHash).catch(() => null);
    setPublished({ id: receipt ? publishedId(receipt.logs as never) : null, name: check.metadata.name });
    await refresh();
  };

  if (published) {
    return (
      <section className="th-page th-done" aria-live="polite">
        <EmptyState icon={<CircleCheck aria-hidden />} why={S.done(published.name)} nextAction={{ label: published.id ? S.open : THEMES.theme.all, href: published.id ? `/themes/${published.id}` : "/themes" }} />
      </section>
    );
  }

  const preview = (
    <Suspense fallback={<span className="skel th-skel-spark" />}>
      <Preview daily={daily} d={d} />
    </Suspense>
  );
  const blocker = check.stocks ?? check.rule ?? check.publish;
  const action = !writes.signedIn ? (
    <button type="button" data-primary-action="" className="kit-pill kit-pill--accent kit-pill--lg kit-pill--block" onClick={() => shell.openPicker(`${S.publish} · ${d.name.trim() || THEMES.title}`)}>{S.signIn}</button>
  ) : (
    <TxCta state={blocker && !busy ? { kind: "blocked", reason: blocker } : writes.tx.state.kind === "confirmed" ? { kind: "idle" } : writes.tx.state} action={S.publish} signer={writes.signer} sponsored={false} onConfirm={() => void publish()} />
  );

  return (
    <section className="th-page th-studio">
      <h1 className="type-display text-ink">{S.title}</h1>
      <div className="th-studio-grid">
        <StudioWizard
          label={S.title}
          steps={[
            { id: "stocks", label: S.steps.stocks, blocker: check.stocks, content: <><StocksStep d={d} set={set} stocks={stocks} problem={d.members.length > 0 ? check.stocks : null} /><div className="th-studio-preview">{preview}</div></> },
            { id: "rule", label: S.steps.rule, blocker: check.rule, content: <RuleStep d={d} set={set} problem={check.rule} /> },
            {
              id: "publish",
              label: S.steps.publish,
              blocker: null,
              content: (
                <div className="th-fields">
                  <NameStep d={d} set={set} />
                  <PartitionBar slices={slices} height={8} label={THEMES.theme.mix} />
                  {action}
                  <p className="type-caption text-ink-secondary">{S.selfPaid}</p>
                  {writes.tx.state.kind === "failed" ? <TxFailureCard state={writes.tx.state} onRetry={() => writes.tx.dispatch({ type: "reset" })} /> : null}
                </div>
              ),
            },
          ]}
        />
        <aside className="th-side" aria-label={THEMES.theme.mix}>
          <Donut slices={slices} label={THEMES.theme.mix} size={128} thickness={14}>
            <span className="th-ring-figure numbers">{d.members.length}</span>
          </Donut>
          <PartitionBar slices={slices} label={THEMES.theme.mix} />
          {preview}
        </aside>
      </div>
    </section>
  );
}
