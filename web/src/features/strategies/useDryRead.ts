"use client";
// Ported from Owarine 90a91d71:web/src/features/strategies/useDryRead.ts (R4-6, D-227) — one click, one real model call;
// editing the draft makes any previous read obsolete.
import { useEffect, useState } from "react";
import { createDryReadSession, type DryRead } from "./dry-read-session";
import { DRY } from "./DryReadPanel";

export type { DryRead } from "./dry-read-session";

export function useDryRead(draftKey = "") {
  const [state, setState] = useState<DryRead>({ status: "idle" });
  const [session] = useState(() => createDryReadSession(setState, DRY.unreadable));
  useEffect(() => {
    session.reset();
    return session.cancel;
  }, [draftKey, session]);
  return { state, read: session.read, reset: session.reset };
}
