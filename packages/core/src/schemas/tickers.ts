/** The zod validator for ticker symbols (kept out of `market/tickers.ts` so reading the registry never loads zod, §3.1). */
import { z } from "zod";
import { TICKER_SYMBOLS } from "../market/tickers";

export const tickerSymbolSchema = z.enum(TICKER_SYMBOLS);
