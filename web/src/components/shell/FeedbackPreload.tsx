"use client";
// Warms the sound engine and the haptics while the browser is idle (S22.6), so the tap that unlocks audio is heard.
import { useEffect } from "react";
import { preloadFeedback } from "@/lib/feedback";

export function FeedbackPreload() {
  useEffect(() => preloadFeedback(), []);
  return null;
}
