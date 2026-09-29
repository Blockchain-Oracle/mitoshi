/**
 * Every relay policy the relay knows. Each contract stage adds `policies/<area>.ts` and lists it here
 * (`relay-policy-coverage` invariant: a deployed area without a policy fails CI; the vault's `never` list must name
 * deposit/depositAndGrant/grant/fundGrant).
 */
import type { RelayPolicy } from "../types";
import { keysPolicy } from "./keys";
import { noopPolicy } from "./noop";

export { keysPolicy, noopPolicy };

export const POLICIES: readonly RelayPolicy[] = [noopPolicy, keysPolicy];
