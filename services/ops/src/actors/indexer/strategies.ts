/**
 * The indexer's S9 sources (index/0006): every StrategyRegistry on the chain (its metadata read alongside, `fetchStrategyEvents`)
 * and the ERC-8004 ReputationRegistry's feedback from the first agent the product can name. Subscriptions go to the
 * subscriber's `user:` topic and every registry change to `strategies` (`window.ts`).
 */
import type { IndexWriter } from "@cwf/db/idx";
import { feedbackSourceOf, fetchFeedbackEvents, fetchStrategyEvents, strategyRegistriesOf, type OpsClient } from "@cwf/markets/ops";
import type { VenueDeps } from "../../runtime";
import { sourceFollower, type SourceFollower } from "./follower";

export function strategyFollowers(deps: Pick<VenueDeps, "bus">, client: OpsClient, writer: IndexWriter): SourceFollower[] {
  const registries = strategyRegistriesOf(client.chainId).map((r) => sourceFollower(deps, client, writer, { label: "strategies", address: r.registry, fromBlock: r.deployBlock, fetch: fetchStrategyEvents }));
  const feedback = registries.length ? feedbackSourceOf(client.chainId) : null;
  return feedback ? [...registries, sourceFollower(deps, client, writer, { label: "feedback", address: feedback.reputation, fromBlock: feedback.fromBlock, fetch: fetchFeedbackEvents })] : registries;
}
