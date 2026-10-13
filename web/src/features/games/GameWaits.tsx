// The games' route-level waits (R6 T18, D-230), server-safe so a route's `loading.tsx` draws them without loading an
// island: a play route waits as its stage, a list route as its list — never the hall, never three generic tiles.
import { LoadingState } from "@/components/states/LoadingState";

export const StageWait = () => <div className="container"><LoadingState shape="game-stage" label="Loading the game" /></div>;
export const ListWait = () => <div className="container"><LoadingState shape="game-list" label="Loading the list" /></div>;
