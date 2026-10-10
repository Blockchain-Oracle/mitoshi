/**
 * pathUSD: the fee token on every send (N-12) and the collateral of every market. Its own module, apart from
 * `chains.ts`: reading the address must not evaluate viem's Tempo chains, whose `chainConfig` imports viem's
 * `tempo/Abis` whole (~176 KB raw on /trade from one `PATH_USD` import, F-S23-08).
 */
import { TEMPO } from "@cwf/clients";

export const PATH_USD = TEMPO.pathUSD;
