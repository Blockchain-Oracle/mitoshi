"use client";
// Ported from Owarine ecb7565b:web/src/features/terminal/useChartFeedback.ts — fed Mitoshi's live value (D-197) and the
// Window's opening print as the line; sounds and haptics through the app's one feedback engine (`lib/feedback.ts`,
// muted by Sound & Vibration), callouts and flashes by its "reactions" switch, the tense music at −5 %.
import { useEffect, useRef } from "react";
import { feedbackEngines, loadFeedback, useFeedback } from "@/lib/feedback";
import type { FrameInfo } from "./chart/LiveChart";
import { ReactionEngine } from "./feedback/reactions";
import type { TerminalPosition } from "./terminal-positions";
import type { PositionValue } from "./usePositionValue";
import type { ReactionOverlayHandle } from "./ui/ReactionOverlay";

const usd = (base: bigint, decimals: number) => Number(base) / 10 ** decimals;

export function useChartFeedback(input: { symbol: string; spot: number | null; active: TerminalPosition | null; value: PositionValue | null; linePrice: number | null }) {
  const { symbol, spot, active, value, linePrice } = input;
  const feedback = useFeedback();
  const reactions = useRef(new ReactionEngine());
  const overlayHandle = useRef<ReactionOverlayHandle>(null);
  const onFrame = useRef<((info: FrameInfo | null) => void) | null>(null);
  onFrame.current = (info) => overlayHandle.current?.frame(info);

  useEffect(() => void loadFeedback().catch(() => undefined), []);
  useEffect(() => reactions.current.reset(), [symbol]);
  useEffect(() => {
    if (spot === null) return;
    const out = reactions.current.feed({
      t: performance.now(),
      price: spot,
      position: active && value?.pnlBase != null ? { key: active.id, side: active.side === "up" ? 1 : -1, pnl: usd(value.pnlBase, active.decimals), margin: usd(value.costShareBase ?? active.costBase, active.decimals), entry: active.entrySpot ?? spot, line: linePrice } : null,
    });
    const e = feedbackEngines();
    for (const r of out) {
      if (r.kind === "step") {
        if (r.favorable) (e?.sound.playComboStep(r.count), e?.haptics.haptic("move"));
        else if (r.count >= 2) e?.sound.playAdverseStep();
      } else if (r.kind === "surge") {
        if (r.favorable) (e?.sound.playSurge(r.mega), e?.haptics.haptic(r.mega ? "mega" : "surge"));
        else (e?.sound.playSlump(), e?.haptics.haptic("slump"));
        if (feedback.reactions) overlayHandle.current?.flash(r.favorable, r.mega);
      } else {
        if (r.tone === "warn") e?.haptics.haptic("warn");
        if (feedback.reactions) overlayHandle.current?.callout(r.tone, r.emoji, r.text);
      }
    }
    // Fed once per committed price (≤ 5 Hz).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spot]);

  // The tense low-pass while the open position is down 5 % or more (the music engine loads only when music is on).
  const tense = active !== null && value?.pnlBase != null && value.roiBps !== null ? value.roiBps <= -500 : false;
  useEffect(() => {
    if (!feedback.music) return;
    void import("@/lib/sound/music").then((mu) => mu.setMusicTense(tense));
  }, [tense, feedback.music]);

  return { overlayHandle, onFrame };
}
