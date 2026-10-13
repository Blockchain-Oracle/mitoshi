// No launch at this address (R6 money, S02 + T16; D-230), for the proxy's rewrites: the app's VOID ticket for a launch — the address, "No record",
// "Nothing to trade", See launches and Launch a coin — inside the app shell, as an HTTP 404.
import type { Metadata } from "next";
import { LaunchVoid } from "@/features/launch/LaunchVoid";
import { NOT_FOUND } from "@/lib/copy";

export const metadata: Metadata = { title: NOT_FOUND.pageTitle };

export default function LaunchNotFound() {
  return <LaunchVoid />;
}
