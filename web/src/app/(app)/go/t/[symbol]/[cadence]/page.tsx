// `/go/t/<symbol>/<cadence>?side=&stake=` (S11, A-3e; D-227): a share-to-sign link — the terminal opens on that ticker's
// Window with the side picked and the stake set; nothing is placed until the person signs.
import { GoIsland } from "@/features/x/XIsland";

export const metadata = { title: "Opening the call" };

export default function GoTradePage() {
  return <GoIsland />;
}
