// /games' wait (R6 T18, D-230): the hall's own outline — the head, the featured cabinet, the carousel — in the hall's
// own frame (hall.css), for the route's boundary and the hub island's placeholder alike, so it lands in place.
import "./hall.css";
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { gamesHall as gamesHallShape } from "@/components/states/shapes/games";

export function HallLoading() {
  return <LoadingFrame shape="games-hall" label="Loading the games">{gamesHallShape()}</LoadingFrame>;
}
