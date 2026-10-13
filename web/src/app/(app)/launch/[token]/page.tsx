// `/launch/<token>` (S17; R4-11, D-227): one launch — a memecoin's curve, trades and claims, or a stablecoin's supply and
// pair — read client-side from the chain. A path that isn't an address says so.
import { isAddress } from "viem";
import type { Metadata } from "next";
import { Suspense } from "react";
import { TokenScreen } from "@/features/launch/TokenScreen";
import Loading from "./loading";

type Params = Promise<{ token: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  return { title: isAddress(token) ? `Launch ${token.slice(0, 6)}…${token.slice(-4)}` : "Launch" };
}

async function Token({ params }: { params: Params }) {
  const { token } = await params;
  if (!isAddress(token)) return <p className="lp-note">No launch at this address.</p>;
  return <TokenScreen token={token as `0x${string}`} />;
}

export default function LaunchTokenPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Loading />}>
      <Token params={params} />
    </Suspense>
  );
}
