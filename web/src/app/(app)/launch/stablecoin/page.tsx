// `/launch/stablecoin` (S17a; R4-11, D-227): a USD stablecoin, its DEX pair and fee pool in one batch.
import { StablecoinWizard } from "@/features/launch/StablecoinWizard";

export const metadata = { title: "Launch a stablecoin" };

export default function LaunchStablecoinPage() {
  return <StablecoinWizard />;
}
