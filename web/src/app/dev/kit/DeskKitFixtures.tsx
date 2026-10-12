"use client";
// The desk kit (R4-2, D-227; Owarine 90a91d71 components/ui/desk-kit): charts, controls, sequences. Fixture inputs only.
import { formatBaseUnits } from "@cwf/core/units";
import { Bot, Check, CircleSlash, Inbox } from "lucide-react";
import { useState } from "react";
import { EquitySparkline } from "@/components/data/EquitySparkline";
import { CapitalBar, PillButton } from "@/components/kit";
import { Donut, EmptyState, LogoStack, NumberTicker, PartitionBar, RadialGauge, RadioCards, Slider, Sparkline, StatusDot, StepProgress, TabsPanel, Timeline, TimelineDay, TimelineNode, UnderlineTabs, type Slice } from "@/components/kit/desk-kit";
import { Fixture } from "./KitFixtures";

const SLICES: Slice[] = [
  { id: "idle", label: "Idle", value: 6, color: "var(--color-surface-3)" },
  { id: "deployed", label: "Deployed", value: 3, color: "var(--color-accent)" },
  { id: "won", label: "Won", value: 1, color: "var(--color-profit)" },
];

export function DeskKitFixtures() {
  const [tab, setTab] = useState<"record" | "studio">("record");
  const [pick, setPick] = useState<"follow" | "fade" | null>("follow");
  const [cap, setCap] = useState(40);
  const [step, setStep] = useState(2);
  const [filter, setFilter] = useState<string | null>(null);
  return (
    <Fixture index="10" title="Desk kit">
      <div className="flex flex-wrap items-center gap-6">
        <Donut slices={SLICES} label="Capital by state">
          <NumberTicker value={cap * 25} className="type-data-lg text-ink" />
        </Donut>
        <RadialGauge value={cap} label="Budget used">{cap}%</RadialGauge>
        <RadialGauge value={92} label="Near the cap" />
        <Sparkline values={[3, 4, 3.5, 5, 6, 5.5, 7]} />
        <Sparkline values={[7, 6, 6.5, 4, 3]} />
        <LogoStack symbols={["BTC", "ETH", "SOL", "TSLA", "NVDA", "AAPL"]} />
      </div>
      <PartitionBar slices={SLICES} label="Capital split" />
      <CapitalBar
        label="Reserve capital"
        format={(b) => `$${formatBaseUnits(b, 6, { minDp: 2, maxDp: 2 })}`}
        totalBase={10_000_000n}
        capBps={8_000}
        active={filter}
        onFilter={setFilter}
        segments={[
          { id: "idle", label: "Idle", valueBase: 5_500_000n, color: "var(--color-surface-3)" },
          { id: "deployed", label: "Deployed", valueBase: 3_000_000n, color: "var(--color-accent)" },
          { id: "won", label: "Won back", valueBase: 1_000_000n, color: "var(--color-profit)" },
        ]}
      />
      <EquitySparkline
        decimals={6}
        labels={{ empty: "No settled rounds yet", curve: (d, amount) => `Net ${d} $${amount}` }}
        points={[0n, 1_200_000n, 700_000n, 2_100_000n, 1_600_000n, 2_900_000n].map((cumulativeBase, i) => ({ atMs: i === 0 ? null : i, cumulativeBase }))}
      />
      <Slider value={cap} onChange={setCap} min={0} max={100} step={5} label="Budget" display={`${cap}%`} />
      <div className="flex flex-wrap gap-2">
        <StatusDot tone="live">Live</StatusDot>
        <StatusDot tone="practice">Practice</StatusDot>
        <StatusDot tone="warn">Low</StatusDot>
        <StatusDot tone="stopped">Stopped</StatusDot>
        <StatusDot tone="quiet">Quiet</StatusDot>
      </div>
      <UnderlineTabs value={tab} onChange={setTab} label="Desk tabs" items={[{ value: "record", label: "Record", count: 3 }, { value: "studio", label: "Studio" }]}>
        <TabsPanel value="record">
          <Timeline label="Decisions">
            <TimelineDay>Today</TimelineDay>
            <TimelineNode icon={<Check />} tone="acted" index={0}>Bet UP · won</TimelineNode>
            <TimelineNode icon={<CircleSlash />} tone="declined" index={1}>Held — the spread was wide</TimelineNode>
            <TimelineNode icon={<Bot />} tone="asked" index={2}>Asked for a read</TimelineNode>
          </Timeline>
        </TabsPanel>
        <TabsPanel value="studio">
          <StepProgress steps={[{ label: "Rule" }, { label: "Limits" }, { label: "Name" }, { label: "Publish" }]} current={step} onPick={setStep} label="Studio steps" />
          <div className="mt-4 flex gap-2">
            <PillButton tone="ghost" size="sm" onClick={() => setStep((s) => Math.max(1, s - 1))}>Back</PillButton>
            <PillButton tone="ink" size="sm" onClick={() => setStep((s) => Math.min(4, s + 1))}>Next</PillButton>
          </div>
        </TabsPanel>
      </UnderlineTabs>
      <RadioCards value={pick} onChange={setPick} label="Copy mode" items={[{ value: "follow", title: "Follow", body: "Take the same side." }, { value: "fade", title: "Fade", body: "Take the other side." }]} />
      <EmptyState icon={<Inbox />} title="Nothing yet" body="Your first call shows here." action={<PillButton tone="accent" size="sm">Make a call</PillButton>} />
    </Fixture>
  );
}
