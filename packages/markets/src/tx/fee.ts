/**
 * Fees on Tempo (N-12, plan C.2.3): there is no gas token. Every send names pathUSD as its fee token explicitly (a
 * plain transfer of a non-USD TIP-20 is otherwise invalid), sets an explicit priority fee, and asks the relay to pay
 * when the area's policy covers the call.
 */
import { PATH_USD } from "../chains";

export const FEE_TOKEN = PATH_USD;

/** Explicit priority fee (attodollars/gas as the chain denominates it): the base fee dominates on Tempo. */
export const PRIORITY_FEE_PER_GAS = 1n;
