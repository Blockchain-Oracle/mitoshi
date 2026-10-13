"use client";
// The docs' contents on a phone: a Contents button that opens the sidebar in the right-edge panel (S20 row; D-190).
// The panel (`DocsDrawer`) is loaded on the first tap, or at once when the address says it is open (`?d=docs`: a reload,
// Forward; R4-2, D-190). On the title's row (R4-10, D-227): under 640 px it is the list icon alone, so a 320 px title keeps
// its width.
import { ListIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { useOpenDrawerName } from "@/lib/drawer-param";

const DocsDrawer = dynamic(() => import("./DocsDrawer"), { ssr: false });

export function DocsMobileNav() {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const inUrl = useOpenDrawerName() === "docs";
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWanted(true);
          setOpen(true);
        }}
        className="inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-full border border-hairline bg-stage type-body-strong text-ink sm:px-4 lg:hidden"
      >
        <ListIcon aria-hidden className="size-4" />
        <span className="max-sm:sr-only">Contents</span>
      </button>
      {wanted || inUrl ? <DocsDrawer open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}
