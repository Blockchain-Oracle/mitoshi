// `/go/w/<marketId>?side=&stake=` (S11, A-3e; D-227): a share-to-sign link to one Window — the terminal opens on it with
// the side picked and the stake set; a Window that has ended moves to its successor (the terminal's own rule).
import { GoIsland } from "@/features/x/XIsland";

export const metadata = { title: "Opening the call" };

export default function GoWindowPage() {
  return <GoIsland />;
}
