// The terminal's route group (S23, D-192): `/trade/[symbol]` inside the app shell, marked so the shell drops its top
// line, footer and dock and the stage holds the screen edge to edge (`app-shell.css`, `:has(.terminal-surface)`).
import type { ReactNode } from "react";

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return <div className="terminal-surface">{children}</div>;
}
