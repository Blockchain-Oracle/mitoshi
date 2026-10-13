// `/themes/<id>` (S16; R4-11, D-227): one theme — its mix, holdings, rebalances and rules — read client-side from the
// chain; `?follow=1` opens the follow sheet (the catalogue's Follow pill). An id that isn't a theme number says so.
import type { Metadata } from "next";
import { Suspense } from "react";
import { ThemeIsland } from "@/features/themes/islands";
import { DataGate } from "@/providers/data/DataGate";
import Loading from "./loading";

type Params = Promise<{ slug: string }>;
type Search = Promise<{ follow?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  return { title: /^\d+$/.test(slug) ? `Theme #${slug}` : "Theme" };
}

async function Theme({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ slug }, { follow }] = await Promise.all([params, searchParams]);
  if (!/^\d{1,18}$/.test(slug)) return <p className="th-note">No theme with this number.</p>;
  return (
    <DataGate fallback={<Loading />}>
      <ThemeIsland themeId={BigInt(slug)} openFollow={follow === "1"} />
    </DataGate>
  );
}

export default function ThemePage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<Loading />}>
      <Theme params={params} searchParams={searchParams} />
    </Suspense>
  );
}
