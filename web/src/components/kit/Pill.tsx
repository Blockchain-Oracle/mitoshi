// The kit pill without Base UI (R6, D-230): the states, write CTAs and toasts that ship in every route's first load
// wear PillButton's look from a plain <button> or link, so Base UI's button (and its composite context) stays out of
// the first load (scripts/perf/route-budgets.ts). Everything else keeps PillButton. Classes join plainly, not through
// `cn` (tailwind-merge): the kit-pill classes never conflict, and the merger would ride into every error boundary.
import Link from "next/link";
import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import { pillButtonVariants, type PillLook } from "./pill-variants";

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");

type Look = PillLook & { className?: string };

export function Pill({ tone, size, block, className, type = "button", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & Look) {
  return <button type={type} data-slot="pill-button" className={join(pillButtonVariants({ tone, size, block }), className)} {...props} />;
}

/** The same pill as a link: an app route through next/link, or a plain anchor (`native`) where the router must not run. */
export function PillLink({ tone, size, block, className, href, native = false, ...props }: Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> & Look & { href: string; native?: boolean }) {
  const cls = join(pillButtonVariants({ tone, size, block }), className);
  return native ? <a href={href} data-slot="pill-button" className={cls} {...props} /> : <Link href={href} data-slot="pill-button" className={cls} {...props} />;
}
