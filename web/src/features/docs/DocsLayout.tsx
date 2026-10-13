// The docs layout (S20, L-20; `/privacy` and `/terms` share it): the sidebar beside the page on a desk, a Contents
// button opening it from the right edge on a phone, and the page's prose (`Prose.tsx`) in a readable measure. R4-10
// (D-227): no inset of its own (the stage's is the only one); the aside sticks under the stage's top edge; on a phone
// the Contents pill sits on the title's row instead of above it; on a desk an on-page contents follows the reader.
import type { ReactNode } from "react";
import { DocsMobileNav } from "./DocsMobileNav";
import { DocsSidebar } from "./DocsSidebar";
import { DocsToc } from "./DocsToc";

export function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto grid max-w-(--content-wide) gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_12rem]">
      <aside className="hidden lg:block">
        <div className="sticky top-(--stage-sticky-top)">
          <DocsSidebar />
        </div>
      </aside>
      <div className="relative flex min-w-0 flex-col">
        <div className="absolute right-0 top-0 lg:hidden">
          <DocsMobileNav />
        </div>
        <article className="docs-prose flex max-w-3xl flex-col gap-5">{children}</article>
      </div>
      <aside className="hidden xl:block">
        <div className="sticky top-(--stage-sticky-top)">
          <DocsToc />
        </div>
      </aside>
    </div>
  );
}
