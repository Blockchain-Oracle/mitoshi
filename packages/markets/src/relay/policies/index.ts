/**
 * Every relay policy the relay knows. Each contract stage adds `policies/<area>.ts` and lists it here
 * (`relay-policy-coverage` invariant: a deployed area without a policy fails CI; the vault's `never` list must name
 * deposit/depositAndGrant/grant/fundGrant).
 */
import type { RelayPolicy } from "../types";
import { agentsPolicy } from "./agents";
import { arenaPolicy } from "./arena";
import { enginePolicy } from "./engine";
import { keysPolicy } from "./keys";
import { launchPolicy } from "./launch";
import { leveragePolicy } from "./leverage";
import { makerPolicy } from "./maker";
import { noopPolicy } from "./noop";
import { parlayPolicy } from "./parlay";
import { privatePolicy } from "./private";
import { rangePolicy } from "./range";
import { strategiesPolicy } from "./strategies";
import { themesPolicy } from "./themes";
import { vaultPolicy } from "./vault";
import { vault2Policy } from "./vault2";

export { agentsPolicy, arenaPolicy, enginePolicy, keysPolicy, launchPolicy, leveragePolicy, makerPolicy, noopPolicy, parlayPolicy, privatePolicy, rangePolicy, strategiesPolicy, themesPolicy, vault2Policy, vaultPolicy };

export const POLICIES: readonly RelayPolicy[] = [noopPolicy, keysPolicy, launchPolicy, themesPolicy, vaultPolicy, vault2Policy, enginePolicy, parlayPolicy, rangePolicy, leveragePolicy, makerPolicy, privatePolicy, arenaPolicy, strategiesPolicy, agentsPolicy];
