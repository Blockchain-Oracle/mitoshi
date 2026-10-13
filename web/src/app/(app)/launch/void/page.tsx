// `/launch/void` (R6 money, S02 + T16; D-230): where the proxy sends a `/launch/<x>` that can't be a launch
// (`lib/launch-route.ts`) — a static page that is a 404 before anything streams, so the answer's status is 404 and its
// body the VOID ticket (`not-found.tsx` → `LaunchVoid`). The address bar keeps what was typed.
import { notFound } from "next/navigation";

export default function LaunchVoidPage() {
  notFound();
}
