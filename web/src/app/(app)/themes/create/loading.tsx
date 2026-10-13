// `/themes/create` while it loads (R6, D-230): the studio's own outline.
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { themeStudio } from "@/components/states/shapes/themes";

export default function Loading() {
  return <LoadingFrame shape="theme-studio" label="Opening the studio" delayMs={120}>{themeStudio()}</LoadingFrame>;
}
