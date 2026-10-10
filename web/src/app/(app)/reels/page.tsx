// `/reels` (S13 step 9): live Windows and people's takes as one vertical snap feed.
import { ReelsPage as Reels } from "@/features/reels/ReelsPage";
import "@/styles/reel-theme.css";
import "@/styles/reel.css";
import "@/styles/reel-chrome.css";
import "@/styles/take.css";
import "@/styles/reels-surface.css";

export const metadata = { title: "Reels", description: "Swipe through live Windows and the calls people make on them." };

export default function ReelsPage() {
  return <Reels />;
}
