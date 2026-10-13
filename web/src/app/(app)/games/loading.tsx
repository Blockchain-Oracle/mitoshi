// The route's loading boundary (R4-13a, D-227; plan §3.2 per-segment loading). R6 (T18, D-230): /games waits as its own
// hall (the cabinet and the carousel), and every play and list route under it has a boundary of its own, so the hall
// never stands in for a game.
import { HallLoading } from "@/features/games/hall/HallLoading";

export default function Loading() {
  return <HallLoading />;
}
