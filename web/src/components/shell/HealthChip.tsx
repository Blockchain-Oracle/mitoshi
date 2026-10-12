"use client";
// Ported from Owarine 90a91d71:web/src/components/shell/app/HealthChip.tsx (P0, D-222): the network and its health as
// one dot and a word — the `/status` verdict, polled every 30 s while the tab is visible — and a link to the page.
import Link from "next/link";
import { useEffect, useState } from "react";
import { SHELL } from "@/lib/copy";

type Overall = keyof typeof SHELL.health;
const POLL_MS = 30_000;

export function HealthChip({ className }: { className?: string }) {
  const [overall, setOverall] = useState<Overall>("unread");
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/status")
        .then((r) => (r.ok ? r.json() : null))
        .then((b: { overall?: Overall } | null) => alive && setOverall(b?.overall && b.overall in SHELL.health ? b.overall : "unreachable"))
        .catch(() => alive && setOverall("unreachable"));
    };
    read();
    const t = setInterval(read, POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return (
    <Link href="/status" className={`health-chip ${className ?? ""}`} data-state={overall} title={SHELL.health[overall]}>
      <span aria-hidden className="health-dot" />
      <span className="health-net">{SHELL.network}</span>
      <span className="health-word">· {SHELL.health[overall]}</span>
    </Link>
  );
}
