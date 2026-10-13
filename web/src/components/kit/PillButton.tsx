// Ported from Owarine 90a91d71:web/src/components/kit/PillButton.tsx (R4-2, D-227) — UGLYCASH's buttons on Mitoshi's
// tokens: always a pill, never a shadow. Accent (vermilion) is THE action on a screen, one per view; ink is the default
// action; white sits on the stage; ghost sits on a card; up and down wear the ticket's UP/DOWN washes; up-fill and down-fill are the ticket CTA's solid sides (R6: the write CTA
// keeps them in flight). `sm` is 36 px
// with a 44 px hit area, `md` 48, `lg` the ticket CTA's 52. Pressing sinks the pill slightly (not under reduced motion).
// `pillButtonVariants` gives a Link the same look.
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cn } from "@/lib/utils";
import { pillButtonVariants, type PillLook } from "./pill-variants";

export { pillButtonVariants, type PillTone } from "./pill-variants";
export type PillButtonProps = ButtonPrimitive.Props & PillLook;

export function PillButton({ className, tone, size, block, nativeButton, ...props }: PillButtonProps) {
  return <ButtonPrimitive data-slot="pill-button" nativeButton={nativeButton ?? props.render === undefined} className={cn(pillButtonVariants({ tone, size, block }), className)} {...props} />;
}
