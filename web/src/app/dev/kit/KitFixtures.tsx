"use client";
// The kit's pieces at every tone and size (R4-2, D-227). Fixture inputs only.
import { keypadDisplay } from "@cwf/core/input";
import { ArrowRight, History, Settings, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Card, Eyebrow, FeatureCard, GroupedItem, GroupedList, GroupedToggle, HoldToConfirm, InfiniteSlider, Keypad, Masked, Odometer, PillButton, pillButtonVariants, PrivacyToggle, ScrollRail, SectionHeader, Seal, Sticker, SwipeToConfirm, TextTabPanel, TextTabs, type FeatureTone, type PillTone } from "@/components/kit";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";

const TONES: PillTone[] = ["accent", "ink", "white", "ghost", "up", "down"];
const FEATURE_TONES: FeatureTone[] = ["accent", "profit", "surface", "cream", "black", "white"];
const ASSETS = ["BTC", "ETH", "SOL", "TSLA", "NVDA", "AAPL", "MSFT", "AMZN"];

export function Fixture({ index, title, children }: { index: string; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4" aria-label={title}>
      <SectionHeader index={index} title={title} />
      {children}
    </section>
  );
}

export function KitFixtures() {
  const [tab, setTab] = useState<"markets" | "portfolio" | "games">("markets");
  const [figure, setFigure] = useState(1234.56);
  const [swipe, setSwipe] = useState<"idle" | "busy" | "done">("idle");
  const [typed, setTyped] = useState("");
  const [held, setHeld] = useState(0);
  const [sound, setSound] = useState(true);
  return (
    <div className="flex flex-col gap-10">
      <Fixture index="01" title="PillButton">
        {(["sm", "md", "lg"] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-3">
            {TONES.map((tone) => (
              <PillButton key={tone} tone={tone} size={size}>
                {tone}
              </PillButton>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <PillButton tone="accent" size="icon" aria-label="Next" title="Next">
            <ArrowRight aria-hidden />
          </PillButton>
          <PillButton tone="accent" size="lg" block>
            Block
          </PillButton>
          <PillButton tone="ink" disabled>
            Disabled
          </PillButton>
        </div>
      </Fixture>

      <Fixture index="02" title="Card · FeatureCard · Eyebrow">
        <Card>
          <Eyebrow>Eyebrow</Eyebrow>
          <p className="type-title text-ink">A card on the stage</p>
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {FEATURE_TONES.map((tone) => (
            <FeatureCard key={tone} tone={tone}>
              <p className="type-title">{tone}</p>
            </FeatureCard>
          ))}
        </div>
      </Fixture>

      <Fixture index="03" title="TextTabs">
        <TextTabs value={tab} onChange={setTab} label="Fixture tabs" tabs={[{ value: "markets", label: "Markets" }, { value: "portfolio", label: "Portfolio" }, { value: "games", label: "Games" }]}>
          <TextTabPanel value="markets" className="pt-3 type-body text-ink-secondary">Markets panel</TextTabPanel>
          <TextTabPanel value="portfolio" className="pt-3 type-body text-ink-secondary">Portfolio panel</TextTabPanel>
          <TextTabPanel value="games" className="pt-3 type-body text-ink-secondary">Games panel</TextTabPanel>
        </TextTabs>
        <TextTabs size="lg" value={tab} onChange={setTab} label="Fixture tabs, large" tabs={[{ value: "markets", label: "Markets" }, { value: "portfolio", label: "Portfolio" }, { value: "games", label: "Games" }]} />
      </Fixture>

      <Fixture index="04" title="Odometer · Masked">
        <div className="flex flex-wrap items-baseline gap-6 type-data-lg text-ink">
          <Odometer value={figure} />
          <Odometer value={figure - 1200} kind="pnl" />
          <Odometer value={-(figure / 1000)} kind="pct" />
          <Odometer value={Math.round(figure)} kind="plain" />
          <Odometer value={0} kind="pnl" zeroIsUp />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PillButton tone="ghost" size="sm" onClick={() => setFigure((v) => Math.round((v + 37.21) * 100) / 100)}>Roll up</PillButton>
          <PillButton tone="ghost" size="sm" onClick={() => setFigure((v) => Math.round((v - 61.4) * 100) / 100)}>Roll down</PillButton>
          <PrivacyToggle />
          <span className="type-data-lg text-ink">
            <Masked>
              <Odometer value={figure} />
            </Masked>
          </span>
        </div>
      </Fixture>

      <Fixture index="05" title="Sticker · Seal">
        <div className="flex flex-wrap items-center gap-5 py-2">
          {FEATURE_TONES.map((tone, i) => (
            <Sticker key={tone} tone={tone} size={i % 3 === 0 ? "sm" : i % 3 === 1 ? "md" : "lg"} tilt={i % 2 ? 3 : -4} icon={i === 0 ? <ShieldCheck aria-hidden className="size-4" /> : null}>
              {tone}
            </Sticker>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Seal size="sm" />
          <Seal size="md" tone="ink" />
          <Seal size="lg" tone="stage" stamp title="Mitoshi" />
        </div>
      </Fixture>

      <Fixture index="06" title="SwipeToConfirm · HoldToConfirm">
        <SwipeToConfirm label="Swipe to place" busyLabel="Placing…" doneLabel="Placed" state={swipe} onConfirm={() => { setSwipe("busy"); window.setTimeout(() => setSwipe("done"), 1200); }} />
        <SwipeToConfirm label="Swipe to close" busyLabel="Closing…" doneLabel="Closed" tone="ink" onConfirm={() => undefined} disabled />
        <div className="flex flex-wrap items-center gap-3">
          <PillButton tone="ghost" size="sm" onClick={() => setSwipe("idle")}>Reset the swipe</PillButton>
          <HoldToConfirm confirmLabel="Held" onConfirm={() => setHeld((n) => n + 1)}>Hold to confirm</HoldToConfirm>
          <span role="status" className="type-caption text-ink-secondary">Held {held}×</span>
        </div>
      </Fixture>

      <Fixture index="07" title="Keypad">
        <p className="text-center type-data-hero text-ink">{keypadDisplay(typed)}</p>
        <Keypad value={typed} onChange={setTyped} labels={{ group: "Amount keypad", del: "Delete", point: "Decimal point" }} className="mx-auto w-full max-w-sm" />
      </Fixture>

      <Fixture index="08" title="GroupedList">
        <GroupedList title="Trading">
          <GroupedItem icon={Settings} label="Trade settings" detail="1m" onClick={() => undefined} />
          <GroupedItem icon={History} label="Trade history" href="#history" />
          <GroupedToggle label="Sound" sub="Taps and fills" checked={sound} onChange={setSound} />
        </GroupedList>
      </Fixture>

      <Fixture index="08b" title="InfiniteSlider · ScrollRail">
        <InfiniteSlider durationOnHover={90} duration={30}>
          {ASSETS.map((a) => (
            <span key={a} className="flex items-center gap-2 type-body-strong text-ink">
              <AssetDisc asset={a} className="grid size-6 place-items-center overflow-hidden rounded-full bg-surface-2 [&_.asset-mark]:size-full" />
              {a}
            </span>
          ))}
        </InfiniteSlider>
        <ScrollRail label="Assets">
          {ASSETS.map((a) => (
            <PillButton key={a} tone="ghost" size="sm">{a}</PillButton>
          ))}
        </ScrollRail>
        <ScrollRail as="nav" label="Tickers">
          {ASSETS.map((a, i) => (
            <a key={a} href={`#${a}`} aria-current={i === 0 ? "page" : undefined} className={pillButtonVariants({ tone: "white", size: "sm" })}>{a}</a>
          ))}
        </ScrollRail>
      </Fixture>
    </div>
  );
}
