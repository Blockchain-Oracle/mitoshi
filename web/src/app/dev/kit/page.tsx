// Fixture: every piece of the component kit (R4-2, D-227) and the overlay grammar, at every tone and size, for the slice
// checks (both themes, five widths, reduced motion). Fixture inputs only; nothing here reads or writes the chain. Gated
// with the other /dev pages (app/dev/layout.tsx answers 404 in production).
import { DeskKitFixtures } from "./DeskKitFixtures";
import { KitFixtures } from "./KitFixtures";
import { OverlayFixtures } from "./OverlayFixtures";

export const metadata = { title: "Kit fixtures" };

export default function KitPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
      <header className="flex flex-col gap-1">
        <h1 className="type-title text-ink">The kit — every piece</h1>
        <p className="type-caption text-ink-secondary">Fixture inputs, not chain data. Import from @/components/kit and @/components/kit/desk-kit.</p>
      </header>
      <KitFixtures />
      <OverlayFixtures />
      <DeskKitFixtures />
    </main>
  );
}
