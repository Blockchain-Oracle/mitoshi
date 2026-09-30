/**
 * Every relay policy the relay knows. Each contract stage adds `policies/<area>.ts` and lists it here
 * (`relay-policy-coverage` invariant: a deployed area without a policy fails CI; the vault's `never` list must name
 * deposit/depositAndGrant/grant/fundGrant).
 */
import type { RelayPolicy } from "../types";
import { enginePolicy } from "./engine";
import { keysPolicy } from "./keys";
import { launchPolicy } from "./launch";
import { noopPolicy } from "./noop";
import { parlayPolicy } from "./parlay";
import { stocksRelayPolicy } from "./stocks";
import { themesPolicy } from "./themes";
import { vaultPolicy } from "./vault";

export { enginePolicy, keysPolicy, launchPolicy, noopPolicy, parlayPolicy, stocksRelayPolicy, themesPolicy, vaultPolicy };

export const POLICIES: readonly RelayPolicy[] = [noopPolicy, keysPolicy, launchPolicy, themesPolicy, stocksRelayPolicy, vaultPolicy, enginePolicy, parlayPolicy];
