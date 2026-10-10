"use client";
// The docs' contents on a phone: a Contents button that opens the sidebar in the right-edge panel (S20 row; D-190).
// The panel (`DocsDrawer`) is loaded on the first tap.
import { ListIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";

const DocsDrawer = dynamic(() => import("./DocsDrawer"), { ssr: false });

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        className="inline-flex min-h-touch items-center gap-2 self-start rounded-full border border-hairline px-4 type-body-strong text-ink lg:hidden"
      >
        <ListIcon aria-hidden className="size-4" /> Contents
      </button>
      {wanted ? <DocsDrawer open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
