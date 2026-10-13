// `/trade-from-x` (S11, D-227): sign in with X, link the account, fund X trading, post a call — Owarine 90a91d71's
// TradeFromXScreen on Mitoshi's account and EventVault, in the app shell since R4-8 (critic bug 15, D-226 point 3).
import { TradeFromXIsland } from "@/features/x/XIsland";

export const metadata = { title: "Trade from X" };

export default function TradeFromXPage() {
  return <TradeFromXIsland />;
}
