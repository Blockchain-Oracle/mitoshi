// `/u/<address>` (C.3.9, `isAddress`): a wallet's public record — S5's profile component (`features/profile`), which
// S13 extends with calls, takes and follows. Read at request time; an id that isn't an address says so.
import { isAddress } from "viem";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ProfileLoading } from "@/features/profile/ProfileLoading";
import { ProfileScreen } from "@/features/profile/ProfileScreen";

type Params = Promise<{ address: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { address } = await params;
  return { title: isAddress(address) ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Profile", description: "A wallet's settled record on Mitoshi: P&L, return, win rate, tier, badges and its latest Windows, each with its proof." };
}

async function Profile({ params }: { params: Params }) {
  const { address } = await params;
  if (!isAddress(address)) {
    return <p className="mx-auto max-w-(--content-reading) px-gutter py-10 type-body text-ink-secondary">That isn&apos;t a wallet address: a profile link ends in 0x and 40 hex characters.</p>;
  }
  return <ProfileScreen address={address.toLowerCase() as `0x${string}`} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<ProfileLoading />}>
      <Profile params={params} />
    </Suspense>
  );
}
