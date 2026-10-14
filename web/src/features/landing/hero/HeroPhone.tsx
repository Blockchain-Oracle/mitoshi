// The hero's phone (R6 landing L01): 21st.dev 20020's frame around the live screen. The server reads the Window, its
// pays and the line (`hero.server.ts`) inside Suspense with a 900 ms budget — whatever arrives in time is drawn, the
// rest the island fetches — and draws the first paint with real figures; `HeroLiveIsland` then makes it live. The
// screen's discs are drawn here, once per candidate, so the island never ships the ticker registry.
import { connection } from "next/server";
import { Suspense } from "react";
import { AssetDisc } from "@/features/markets/hero/AssetDisc";
import { heroModel, type HeroWire } from "./hero-model";
import { HERO_SYMBOLS } from "./hero-window";
import { heroData } from "./hero.server";
import { HeroLiveIsland } from "./HeroLiveIsland";
import { HeroScreen, HeroScreenWait } from "./HeroScreen";
import { PhoneFrame } from "./PhoneFrame";

const HERO_BUDGET_MS = 900;

async function inTime<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), HERO_BUDGET_MS);
  });
  try {
    return await Promise.race([work.catch(() => fallback), late]);
  } finally {
    clearTimeout(timer);
  }
}

async function SeededScreen() {
  await connection();
  const nowMs = Date.now();
  const empty: HeroWire = { window: null, pays: { upTicks: null, downTicks: null }, points: [], symbol: HERO_SYMBOLS[0], readAtMs: nowMs };
  const wire = await inTime(heroData(), empty);
  const discs = Object.fromEntries(HERO_SYMBOLS.map((s) => [s, <AssetDisc key={s} asset={s} className="hs-disc" />]));
  const points = wire.points.map(([t, p]) => ({ t, p: Number(BigInt(p)) / 1e8 }));
  const m = heroModel({ window: wire.window, pays: wire.pays, symbol: wire.symbol, points, priceE8: wire.points.at(-1)?.[1] ?? null, nowMs, live: false, stale: false });
  return (
    <HeroLiveIsland wire={wire} discs={discs}>
      <HeroScreen m={m} disc={discs[wire.symbol]} />
    </HeroLiveIsland>
  );
}

export function HeroPhone({ className }: { className?: string }) {
  return (
    <PhoneFrame className={className}>
      <Suspense fallback={<HeroScreenWait />}>
        <SeededScreen />
      </Suspense>
    </PhoneFrame>
  );
}
