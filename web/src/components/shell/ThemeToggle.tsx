"use client";
// Ported from Masayume 68f7a09:web/src/components/shell/ThemeToggle.tsx — the icon now follows the attribute the
// pre-paint script already set, read through `useSyncExternalStore` (no mount flash, no effect).

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { SHELL } from "@/lib/copy";
import { toggleTheme, type Theme } from "@/lib/theme";

const listeners = new Set<() => void>();
const read = (): Theme => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "dark" as Theme);
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={() => {
        toggleTheme(theme);
        for (const l of listeners) l();
      }}
      aria-label={isDark ? SHELL.themeToLight : SHELL.themeToDark}
      title={isDark ? SHELL.themeToLight : SHELL.themeToDark}
    >
      {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
    </button>
  );
}
