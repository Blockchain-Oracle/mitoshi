// `/claim` (S11, D-227; replaces R4-11's pending page): Owarine 90a91d71's ClaimScreen and receipt card — sign in with X
// to see which Mitoshi account your mentions trade for, then open it.
import { ClaimIsland } from "@/features/x/XIsland";

export const metadata = { title: "Claim from X" };

export default function ClaimPage() {
  return <ClaimIsland />;
}
