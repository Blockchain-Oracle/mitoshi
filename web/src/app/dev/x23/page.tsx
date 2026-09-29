// Spike X23 fixture: the revamped 21st swap ticket (27122) under Masayume tokens, Base UI-era a11y and `m.*`. The
// values are labelled fixture inputs for design review only; S15 wires the ticket to the v4 quoter.
import { X23Fixture } from "./X23Fixture";

export const metadata = { title: "X23 · swap ticket fixture" };

export default function X23Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-10">
      <h1 className="type-title text-ink">X23 — revamped swap ticket</h1>
      <p className="type-caption text-ink-secondary">Fixture inputs, not market data. Review only (plan §5 X23).</p>
      <X23Fixture />
    </main>
  );
}
