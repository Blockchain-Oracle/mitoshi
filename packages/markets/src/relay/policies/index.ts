/**
 * Every relay policy the relay knows. Each contract stage adds `policies/<area>.ts` and lists it here
 * (`relay-policy-coverage` invariant: a deployed area without a policy fails CI; the vault's `never` list must name
 * deposit/depositAndGrant/grant/fundGrant).
 */
import type { RelayPolicy } from "../types";
import { keysPolicy } from "./keys";
import { launchPolicy } from "./launch";
import { noopPolicy } from "./noop";
import { stocksRelayPolicy } from "./stocks";
import { themesPolicy } from "./themes";
import { vaultPolicy } from "./vault";

export { keysPolicy, launchPolicy, noopPolicy, stocksRelayPolicy, themesPolicy, vaultPolicy };

export const POLICIES: readonly RelayPolicy[] = [noopPolicy, keysPolicy, launchPolicy, themesPolicy, stocksRelayPolicy, vaultPolicy];
