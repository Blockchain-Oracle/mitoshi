// Ported from Masayume 68f7a09:web/src/app/not-found.tsx — distinct not-found copy (it said "That page moved", ux-audit
// §8) through the 21st 29419 layout, with the closest nav destination suggested.
import { headers } from "next/headers";
import { Suspense } from "react";
import { NotFound } from "@/components/states/NotFound";
import { EVERYTHING_ITEMS, RAIL_NAV } from "@/components/shell/header/nav-items";

async function Suggested() {
  const h = await headers();
  const path = h.get("x-cwf-path");
  const first = path?.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  const hit = first ? [...RAIL_NAV, ...EVERYTHING_ITEMS].find((i) => !i.external && i.href.split("/")[1]?.startsWith(first.slice(0, 4))) : undefined;
  return <NotFound requestedPath={path} suggestion={hit ? { label: hit.href, href: hit.href } : null} />;
}

export default function NotFoundPage() {
  return (
    <Suspense fallback={<NotFound />}>
      <Suggested />
    </Suspense>
  );
}
