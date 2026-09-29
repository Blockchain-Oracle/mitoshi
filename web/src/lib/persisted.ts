"use client";
// Ported from Masayume 68f7a09:web/src/lib/persisted.ts

import { useCallback, useEffect, useState } from "react";

interface Codec<T> {
  parse: (raw: string) => T | null;
  serialize: (value: T) => string;
}

/**
 * localStorage-backed state that hydrates AFTER mount, so server and first client render agree.
 * Reads and writes are best-effort: a private window or blocked storage simply keeps the default.
 */
export function usePersistedState<T>(key: string, fallback: T, codec: Codec<T>): [T, (value: T) => void, boolean] {
  const [value, setValue] = useState<T>(fallback);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw === null ? null : codec.parse(raw);
      if (parsed !== null) setValue(parsed);
    } catch {
      // storage unavailable — keep the default
    }
    setHydrated(true);
    // codec is a stable module-level object per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const persist = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, codec.serialize(next));
      } catch {
        // storage unavailable — the choice still holds for this session
      }
    },
    [key, codec],
  );

  return [value, persist, hydrated];
}

export const numberCodec: Codec<number> = {
  parse: (raw) => (Number.isFinite(Number(raw)) ? Number(raw) : null),
  serialize: String,
};

export const booleanCodec: Codec<boolean> = {
  parse: (raw) => (raw === "1" ? true : raw === "0" ? false : null),
  serialize: (value) => (value ? "1" : "0"),
};
