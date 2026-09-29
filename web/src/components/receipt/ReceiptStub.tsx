// Ported from Masayume 68f7a09:web/src/components/receipt/ReceiptStub.tsx
import { cn } from "@/lib/utils";

const NOTCH = "absolute top-1/2 size-4 -translate-y-1/2 rounded-full bg-ground";

/** The perforated tear line — paper, not glass. */
export function ReceiptStub({ className }: { className?: string }) {
  return (
    <div role="separator" className={cn("relative border-t border-dashed border-cream-hairline", className)}>
      <span className={cn(NOTCH, "-left-2")} aria-hidden="true" />
      <span className={cn(NOTCH, "-right-2")} aria-hidden="true" />
    </div>
  );
}
