// /earn (S8 box 2, D-224): Owarine 90a91d71 `features/earn` on the deployed maker vault and the three house reserves —
// supply and withdraw on each, the maker's Windows with merge and settle. The screen loads with the late data layer.
import { EarnPage } from "@/features/earn/EarnPage";
import { EARN } from "@/features/earn/copy";

export const metadata = { title: EARN.notDeployed.title };

export default function Page() {
  return <EarnPage />;
}
