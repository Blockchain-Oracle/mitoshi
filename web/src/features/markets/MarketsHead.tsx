"use client";
// /markets' header: static words and the terminal link, shared by the list and the placeholder before it, so the page's
// top doesn't move when the list arrives (S23 gate, F-S23-08: CLS 0.30–0.50 on /markets).
import Link from "next/link";
import { tapFeedback } from "@/lib/feedback";
import { MARKETS } from "./copy";

export function MarketsHead() {
  return (
    <header className="markets-head flex flex-col gap-2">
      <span className="type-label-micro text-ink-secondary">{MARKETS.list.eyebrow}</span>
      <h1 className="type-display text-ink">{MARKETS.list.title}</h1>
      <p className="max-w-(--content-reading) type-body text-ink-secondary">{MARKETS.list.body}</p>
      <Link href="/trade" className="btn btn-primary self-start" onClick={tapFeedback}>{MARKETS.list.cta}</Link>
    </header>
  );
}
