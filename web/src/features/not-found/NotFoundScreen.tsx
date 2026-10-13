"use client";
// Ported from Owarine 90a91d71:web/src/features/not-found/NotFoundScreen.tsx (R4-0, D-227) — a page that is not there,
// told as a Window that voided for want of a print: the path on the ticket, Markets, Home and search to get back. On
// Mitoshi's tokens (`not-found.css`): the kit's Sticker and Seal are a stamped VOID and the dock's seal disc. It
// renders inside the app shell (`app/not-found.tsx` via `NotFoundPage`, `app/(app)/not-found.tsx`): the rail, top line
// and dock stay.
import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import MitoshiMark from "@/components/shell/MitoshiMark";
import { NOT_FOUND } from "@/lib/copy";
import { openSearch } from "@/lib/search-event";
import "@/styles/not-found.css";

// The root 404 is prerendered once, as `/_not-found`, so its server path is never the visitor's: the path comes from
// the address bar after hydration (server and hydration render agree on none — React #418 on testnet otherwise), and
// `usePathname()` re-renders it on a client navigation to another missing page.
const noStore = () => () => {};
const addressPath = () => window.location.pathname;
const noPath = () => null;

export function NotFoundScreen() {
  usePathname();
  const path = useSyncExternalStore(noStore, addressPath, noPath);
  return (
    <div className="nf">
      <div className="nf-col">
        <div className="nf-title-wrap">
          <h1 className="nf-title">{NOT_FOUND.title}</h1>
          <span className="nf-void" aria-hidden>{NOT_FOUND.void}</span>
        </div>
        <p className="nf-line">{NOT_FOUND.line}</p>
        <div className="nf-ticket">
          <span aria-hidden className="nf-seal"><MitoshiMark /></span>
          <dl className="nf-rows">
            <div className="nf-row">
              <dt>{NOT_FOUND.window}</dt>
              <dd className="nf-path">{path}</dd>
            </div>
            <div className="nf-row">
              <dt>{NOT_FOUND.print}</dt>
              <dd className="nf-missing">{NOT_FOUND.missing}</dd>
            </div>
            <div className="nf-row">
              <dt>{NOT_FOUND.result}</dt>
              <dd className="nf-result">{NOT_FOUND.refunded}</dd>
            </div>
          </dl>
        </div>
        <div className="nf-actions">
          <Link href="/markets" className="nf-pill nf-pill--ink">
            {NOT_FOUND.markets} <ArrowRight aria-hidden />
          </Link>
          <Link href="/" className="nf-pill">{NOT_FOUND.home}</Link>
          <button type="button" className="nf-pill nf-pill--icon" aria-label={NOT_FOUND.search} title={NOT_FOUND.search} onClick={openSearch}>
            <Search aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
