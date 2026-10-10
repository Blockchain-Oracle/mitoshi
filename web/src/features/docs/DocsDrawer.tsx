"use client";
// The docs' contents panel on a phone (D-190: right edge), its own chunk: Base UI's drawer loads on the first tap of
// Contents, so no docs page carries it on load (site-owned JS ≤ 35 KB, D-071).
import { SlideOver, SlideOverContent } from "@/components/ui/drawer";
import { DocsSidebar } from "./DocsSidebar";

export default function DocsDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <SlideOver open={open} onOpenChange={onOpenChange}>
      <SlideOverContent title="Documentation">
        <DocsSidebar onNavigate={() => onOpenChange(false)} />
      </SlideOverContent>
    </SlideOver>
  );
}
