// `/themes`' head (R6, D-230): the title and its line, Create on the right. A server component with no client module
// behind it: `/themes/loading.tsx` paints it at once, so whatever it imports rides in the route's first load.
import { Plus } from "lucide-react";
import Link from "next/link";
import { pillButtonVariants } from "@/components/kit/pill-variants";
import { THEMES } from "./copy";
import "@/styles/themes.css";

export function ThemesHead() {
  return (
    <header className="th-page-head">
      <div className="th-page-text">
        <h1 className="type-display text-ink">{THEMES.title}</h1>
        <p className="type-body text-ink-secondary">{THEMES.line}</p>
      </div>
      <Link href="/themes/create" className={pillButtonVariants({ tone: "ink", size: "md" })}>
        <Plus aria-hidden className="size-4" />
        {THEMES.create}
      </Link>
    </header>
  );
}
