// Plan C.3.6 (L-72): internal fixture pages. Production answers 404 unless DEV_FIXTURES=1 (the proxy also 404s them,
// and robots disallow them). Nothing here is linked from the product nav.
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { MotionScope } from "@/components/motion-scope";

export const metadata = { robots: { index: false, follow: false } };

export default function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.DEV_FIXTURES !== "1") notFound();
  return <MotionScope>{children}</MotionScope>;
}
