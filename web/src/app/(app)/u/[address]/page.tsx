// `/u/<address>` (C.3.9, `isAddress`): a wallet's public record — Owarine 90a91d71's profile frame (R4-10, D-227). Read
// at request time; an id that isn't an address is the 404.
import { isAddress } from "viem";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LoadingState } from "@/components/states/LoadingState";
import { ProfileScreen } from "@/features/profile/ProfileScreen";

type Params = Promise<{ address: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { address } = await params;
  return { title: isAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Profile", description: "A wallet's settled record on Mitoshi." };
}

async function Profile({ params }: { params: Params }) {
  const { address } = await params;
  if (!isAddress(address)) notFound();
  return <ProfileScreen address={address.toLowerCase() as `0x${string}`} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<LoadingState shape="plate" label="Reading the record" />}>
      <Profile params={params} />
    </Suspense>
  );
}
