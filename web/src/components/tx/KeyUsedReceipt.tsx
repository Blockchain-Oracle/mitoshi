/**
 * The "key used" receipt (D-052; ux-audit §11.1; N-03): when an access key or session key spent on the user's behalf,
 * say so — which key, what is left of its limit this period, when it expires — with the way to stop it one tap away.
 */
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { TX } from "./copy";

export interface KeyUsedReceiptProps {
  keyLabel: string;
  /** Formatted amounts (dollars first, §2.1.4). */
  leftText: string | null;
  limitText: string | null;
  expiresText: string | null;
}

export function KeyUsedReceipt({ keyLabel, leftText, limitText, expiresText }: KeyUsedReceiptProps) {
  return (
    <aside className="flex items-start gap-3 rounded-lg border border-hairline bg-surface-1 p-3" aria-label={TX.keyUsed.title}>
      <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-md border border-hairline text-ink-secondary"><KeyRound className="size-4" /></span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="type-body-strong text-ink">{TX.keyUsed.title}</p>
        <p className="type-caption text-ink-secondary">{keyLabel}</p>
        {leftText && limitText ? <p className="numbers type-caption text-ink">{TX.keyUsed.left(leftText, limitText)}</p> : null}
        {expiresText ? <p className="type-caption text-ink-secondary">{TX.keyUsed.expires(expiresText)}</p> : null}
      </div>
      <Link href="/settings/account" className="inline-flex min-h-touch items-center px-2 type-caption text-ink! underline underline-offset-4">{TX.keyUsed.manage}</Link>
    </aside>
  );
}
