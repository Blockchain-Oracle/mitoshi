"use client";
// Sound & Vibration (S22.6, D-189) as the account page's DEVICE rows (R4-11, D-227; Owarine 90a91d71 AccountSheet's
// FEEDBACK group: toggle rows with labels only, Trade reactions alone with a line under it). The four device settings
// the shell and the terminal read through `lib/feedback.ts`; turning sounds on plays the tap so the change is heard.
import { GroupedToggle } from "@/components/kit";
import { setFeedback, tapFeedback, useFeedback, type FeedbackSettings } from "@/lib/feedback";
import { ACCOUNT_PAGE } from "./copy";

const F = ACCOUNT_PAGE.feedback;

export function FeedbackRows() {
  const settings = useFeedback();
  return (
    <>
      {F.rows.map((row) => {
        const key = row.key as keyof FeedbackSettings;
        return (
          <GroupedToggle
            key={row.key}
            label={row.label}
            sub={"hint" in row ? row.hint : undefined}
            checked={settings[key]}
            onChange={(on) => {
              setFeedback({ [key]: on });
              if (on && (key === "sound" || key === "haptics")) tapFeedback();
            }}
          />
        );
      })}
    </>
  );
}
