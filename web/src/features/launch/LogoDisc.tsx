"use client";
// A launch's logo disc (R4-11, D-227): the image only when it is hosted here (`/api/launch/logo/<sha>`, a square checked
// on upload) — a remote URL from chain data is not fetched (it could track whoever opens the list) — else the ticker's
// first letters on the accent wash.
import { cn } from "@/lib/utils";

const HOSTED = /^https?:\/\/[^/]+\/api\/launch\/logo\/[0-9a-f]{64}$/;

export function hostedLogo(uri: string): string | null {
  if (typeof window === "undefined" || !HOSTED.test(uri)) return null;
  try {
    return new URL(uri).origin === window.location.origin ? uri : null;
  } catch {
    return null;
  }
}

export function LogoDisc({ uri, symbol, size = "md", className }: { uri: string; symbol: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const src = hostedLogo(uri);
  return (
    <span className={cn("lp-logo", className)} data-size={size} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {src ? <img src={src} alt="" /> : <span>{symbol.slice(0, 2)}</span>}
    </span>
  );
}
