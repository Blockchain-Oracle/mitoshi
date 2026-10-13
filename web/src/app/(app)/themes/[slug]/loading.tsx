// The theme page's shape while it loads (R6, D-230; D-231): the head, the status line, the chart, the mix and the calls,
// the action and the facts — never a line of text where the page will be.
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { themeDetail } from "@/components/states/shapes/themes";

export default function Loading() {
  return <LoadingFrame shape="theme" label="Reading the theme" delayMs={120}>{themeDetail()}</LoadingFrame>;
}
