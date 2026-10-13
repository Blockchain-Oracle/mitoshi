// From 21st.dev 36185 astralyxdev/rate-limit-meter — revamped per D-044 (R4-12, D-227): the remaining count is the
// headline and the window it refills over sits beside it (the component's own rule: a scary number is never shown
// without what makes it harmless). Mitoshi tones (calm / warning under 15% / loss when empty), figures formatted by the
// host from integer base units, a native meter role with a human value text. The burn-rate projection is dropped: a
// rate-limit bucket here drains linearly, so "refills over a day" is the whole story.
import { cn } from "@/lib/utils";

export interface RateLimitMeterProps {
  label: string;
  /** Remaining and capacity on one scale (base units are fine as numbers of the same unit). */
  remaining: number;
  limit: number;
  remainingText: string;
  limitText: string;
  /** e.g. "Refills over 24 h". */
  windowText?: string;
  className?: string;
}

export function RateLimitMeter({ label, remaining, limit, remainingText, limitText, windowText, className }: RateLimitMeterProps) {
  const share = limit > 0 ? Math.max(0, Math.min(1, remaining / limit)) : 0;
  const tone = remaining <= 0 ? "loss" : share < 0.15 ? "warning" : "calm";
  return (
    <div className={cn("rlm", className)} data-tone={tone}>
      <div className="rlm-head">
        <span className="rlm-label">{label}</span>
        {windowText ? <span className="rlm-window">{windowText}</span> : null}
      </div>
      <p className="rlm-figure">
        <span className="numbers rlm-remaining">{remainingText}</span>
        <span className="numbers rlm-limit">/ {limitText}</span>
      </p>
      <div className="rlm-track" role="meter" aria-valuenow={remaining} aria-valuemin={0} aria-valuemax={limit} aria-valuetext={`${remainingText} of ${limitText}`} aria-label={label}>
        <span className="rlm-fill" style={{ width: `${share * 100}%` }} />
      </div>
    </div>
  );
}
