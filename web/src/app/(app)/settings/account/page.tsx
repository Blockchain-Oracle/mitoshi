// The trust surface (D-053): every key the chain knows for this account, each revocable, plus grants, linked wallets
// and region posture. Client-rendered from the wallet session; the chain is read through `/api/keys`.
import { AccountIsland } from "@/features/account/AccountIsland";

export const metadata = { title: "Account" };

export default function AccountSettingsPage() {
  return <AccountIsland />;
}
