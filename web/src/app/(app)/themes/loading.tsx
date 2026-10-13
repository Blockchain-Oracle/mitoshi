// `/themes` while it loads (R6, D-230): the page's own head and its cards' shape, not the app's generic placeholder.
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { themesGrid } from "@/components/states/shapes/themes";
import { ThemesHead } from "@/features/themes/ThemesHead";

export default function Loading() {
  return (
    <section className="th-page">
      <ThemesHead />
      <LoadingFrame shape="themes" label="Reading the themes" delayMs={120}>{themesGrid()}</LoadingFrame>
    </section>
  );
}
