// The phone app's first screen (round 7): the story and the three ways in (features/welcome). The proxy sends a
// first-time app user here; on the web it is reachable but nothing links to it.
import type { Metadata } from "next";
import { WelcomeScreen } from "@/features/welcome/WelcomeScreen";

export const metadata: Metadata = { title: "Welcome", robots: { index: false } };

export default function WelcomePage() {
  return <WelcomeScreen />;
}
