// The trust surface (D-053): every key the chain knows for this account, each revocable, plus grants, linked wallets
// and region posture. Client-rendered from the wallet session; the chain is read through `/api/keys`.
import { AccountSettings } from "@/features/account";

export const metadata = { title: "Account & keys" };

export default function AccountSettingsPage() {
  return <AccountSettings />;
}
