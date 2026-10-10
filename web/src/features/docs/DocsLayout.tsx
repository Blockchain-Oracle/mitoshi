// The docs layout (S20, L-20; `/privacy` and `/terms` share it): the sidebar beside the page on a desk, a Contents
// button opening it from the right edge on a phone, and the page's prose (`Prose.tsx`) in a readable measure.
import type { ReactNode } from "react";
import { DocsMobileNav } from "./DocsMobileNav";
import { DocsSidebar } from "./DocsSidebar";

export function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-(--content-wide) gap-10 px-gutter py-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:px-gutter-desktop lg:py-16">
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <DocsSidebar />
        </div>
      </aside>
      <div className="flex min-w-0 flex-col gap-6">
        <DocsMobileNav />
        <article className="docs-prose flex max-w-3xl flex-col gap-5">{children}</article>
      </div>
    </div>
  );
}
