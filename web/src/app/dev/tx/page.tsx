// Fixture: every TxLifecycle state, the failure card, the cream receipt and the key-used receipt, for the UX gate
// (§2.5 "every state rendered"). Fixture inputs only; nothing here reads or writes the chain.
import { TxFixtures } from "./TxFixtures";

export const metadata = { title: "TxLifecycle fixtures" };

export default function TxPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-10">
      <h1 className="type-title text-ink">TxLifecycle — every state</h1>
      <p className="type-caption text-ink-secondary">Fixture inputs, not chain data (plan S1 1b transactions).</p>
      <TxFixtures />
    </main>
  );
}
