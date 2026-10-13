// The games' route-level waits (R6 T18, D-230), server-safe so a route's `loading.tsx` draws them without loading an
// island: a play route waits as its stage, a list route as its list — never the hall, never three generic tiles.
import { LoadingFrame } from "@/components/states/LoadingFrame";
import { gameList as gameListShape, gameStage as gameStageShape } from "@/components/states/shapes/games";

export const StageWait = () => <div className="container"><LoadingFrame shape="game-stage" label="Loading the game">{gameStageShape()}</LoadingFrame></div>;
export const ListWait = () => <div className="container"><LoadingFrame shape="game-list" label="Loading the list">{gameListShape()}</LoadingFrame></div>;
