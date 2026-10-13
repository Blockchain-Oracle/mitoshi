"use client";
// The docs' contents panel on a phone (D-190: right edge), its own chunk: Base UI's drawer loads on the first tap of
// Contents, so no docs page carries it on load (site-owned JS ≤ 35 KB, D-071). R4-2 (D-227): open, it is `?d=docs`, so
// Back closes it instead of leaving the page; a tap on a page drops the param in place before the link navigates (a
// step back there would race the link's own push).
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { dropDrawerParam } from "@/lib/drawer-param";
import { DocsSidebar } from "./DocsSidebar";

export default function DocsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange} urlKey="docs">
      <SlideOverContent title="Documentation">
        <DocsSidebar
          onNavigate={() => {
            dropDrawerParam();
            onOpenChange(false);
          }}
        />
      </SlideOverContent>
    </SlideOver>
  );
}
