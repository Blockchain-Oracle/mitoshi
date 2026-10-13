// `/launch/meme` (S17b; R4-11, D-227): a memecoin on the curve launchpad, three steps and one signature.
import { MemeWizard } from "@/features/launch/MemeWizard";

export const metadata = { title: "Launch a memecoin" };

export default function LaunchMemePage() {
  return <MemeWizard />;
}
