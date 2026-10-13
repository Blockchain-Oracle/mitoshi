"use client";
// The word filter's answer for a launch's name and ticker (S17; R4-11, D-227) — `/api/launch/name`, debounced, so both
// create wizards ask for another before a name goes on chain for good. Null while it is asked.
import { useEffect, useState } from "react";

export function useNameFlag(text: string): boolean | null {
  const [flag, setFlag] = useState<boolean | null>(false);
  useEffect(() => {
    if (!text.trim()) return void setFlag(false);
    setFlag(null);
    const t = setTimeout(() => {
      void fetch(`/api/launch/name?q=${encodeURIComponent(text)}`).then((r) => r.json() as Promise<{ flagged: boolean }>).then((j) => setFlag(j.flagged), () => setFlag(false));
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  return flag;
}
