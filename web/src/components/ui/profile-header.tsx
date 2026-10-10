// From 21st.dev 781 serafimcloud/telegram-profile-header, revamped per D-044 for the profile (S5, shared with S13): the
// centred avatar, the name over its meta line (the source's "phone • username") and the one action are the source's.
// The expanding photo is gone — a wallet has no image; it is its initials on its address hue, as the account drawer
// draws it — and with it framer-motion; the action is a real link; tokens instead of the source's fixed colours.
import { ArrowUpRight } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { addressHue } from "@/lib/address-hue";

export function ProfileHeader({ address, name, meta, action }: { address: string; name: string; meta: readonly ReactNode[]; action?: { label: string; href: string } }) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <span aria-hidden className="grid size-20 place-items-center rounded-[34px] type-title text-cream" style={{ background: `oklch(0.47 0.13 ${addressHue(address)}deg)` } as CSSProperties}>
        {address.slice(2, 4).toUpperCase()}
      </span>
      <h1 className="font-mono type-title text-ink">{name}</h1>
      <p className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 type-caption text-ink-secondary">
        {meta.map((m, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            {i > 0 ? <span aria-hidden>•</span> : null}
            {m}
          </span>
        ))}
      </p>
      {action ? (
        <a href={action.href} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-touch items-center gap-1.5 rounded-full border border-hairline px-4 type-caption text-ink hover:bg-surface-2">
          {action.label} <ArrowUpRight aria-hidden className="size-3.5" />
        </a>
      ) : null}
    </header>
  );
}
