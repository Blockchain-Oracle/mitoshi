// Ported from Masayume 68f7a09:web/src/lib/env.ts — the Tempo chain port's public config.
import { parseMarketsEnv, type MarketsEnv } from "@cwf/markets";
import { z } from "zod";

const webOnlySchema = z.object({
  walletConnectProjectId: z.string().min(1).optional(),
  appOrigin: z.url().default("http://localhost:3000"),
});

export interface WebEnv extends z.infer<typeof webOnlySchema> {
  markets: MarketsEnv;
}

// Every NEXT_PUBLIC_* variable is referenced literally so Next can inline it into the client bundle. Each one is
// optional: with no .env the app boots read-only against Moderato from baked defaults.
export const webEnv: WebEnv = {
  markets: parseMarketsEnv({
    network: process.env.NEXT_PUBLIC_NETWORK,
    rpcHttpUrls: process.env.NEXT_PUBLIC_TEMPO_RPC_HTTP_URLS,
    rpcWsUrls: process.env.NEXT_PUBLIC_TEMPO_RPC_WS_URLS,
    opsUrl: process.env.NEXT_PUBLIC_OPS_URL,
    streamUrl: process.env.NEXT_PUBLIC_STREAM_URL,
  }),
  ...webOnlySchema.parse({
    walletConnectProjectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || undefined,
    appOrigin: process.env.NEXT_PUBLIC_APP_ORIGIN || undefined,
  }),
};
