"use client";
// Sound & Vibration (S22.6, D-189; Slush's Personalize "Sound and Vibration", Tradash's Settings → Feedback): the four
// device settings the shell and the terminal read through `lib/feedback.ts`. Each row is one label, so the whole row is
// the 44 px target; turning sounds on plays the tap so the change is heard.
import { Switch } from "@/components/ui/switch";
import { setFeedback, tapFeedback, useFeedback, type FeedbackSettings } from "@/lib/feedback";
import { ACCOUNT_PAGE } from "./copy";

const F = ACCOUNT_PAGE.feedback;

export function FeedbackSection({ className }: { className?: string }) {
  const settings = useFeedback();
  return (
    <section aria-labelledby="feedback-title" className={className}>
      <h2 id="feedback-title" className="type-title text-ink">{F.title}</h2>
      <p className="type-caption text-ink-secondary">{F.body}</p>
      <ul className="flex flex-col divide-y divide-hairline">
        {F.rows.map((row) => {
          const key = row.key as keyof FeedbackSettings;
          return (
            <li key={row.key}>
              <label className="flex min-h-touch cursor-pointer items-center justify-between gap-4 py-2">
                <span className="flex min-w-0 flex-col">
                  <span className="type-body-strong text-ink">{row.label}</span>
                  <span className="type-caption text-ink-secondary">{row.hint}</span>
                </span>
                <Switch
                  aria-label={row.label}
                  checked={settings[key]}
                  onCheckedChange={(on) => {
                    setFeedback({ [key]: on });
                    if (on && (key === "sound" || key === "haptics")) tapFeedback();
                  }}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
