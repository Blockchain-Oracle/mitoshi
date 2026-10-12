// The terminal's route group (S23, D-192): `/trade/[symbol]` inside the app shell, marked so the shell drops its top
// line and footer and the stage holds the screen edge to edge (`app-shell.css`, `:has(.terminal-surface…)`). R4-0
// (D-227): when Next keeps this route for Back it hides this node with `display: none`, and the shell's rules match a
// visible surface only, so the next page gets the normal stage; the phone dock stays under the terminal.
import type { ReactNode } from "react";

export default function TerminalLayout({ children }: { children: ReactNode }) {
  return <div className="terminal-surface">{children}</div>;
}
