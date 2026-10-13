// S11 (D-227): one look at whether the relay can read the bot's mentions, without starting it — what `/health` would
// say. Prints which ways in were tried, each one's answer, and the cookie NAMES the Rettiwt key carries; never a value.
//
//   node --env-file=services/ops/.env.local --import tsx services/ops/src/actors/x-relay/check.ts
import { networkFrom } from "@cwf/core";
import { redact } from "../../runtime/env";
import { readRelayEnv } from "./env";
import { candidates, chooseReader } from "./reading";
import { rettiwtKeyCookieNames } from "./rettiwt";

/** Every configured secret replaced by its name, and any long token-shaped run cut, before anything is printed. */
const safe = (value: unknown) => redact(JSON.stringify(value)).replace(/[A-Za-z0-9+/=_%-]{40,}/g, "<redacted>");
const env = readRelayEnv(networkFrom(process.env.NETWORK));
console.log(safe({
  handle: env.handle,
  configured: { rettiwt: env.rettiwtApiKey !== null, xApiUserContext: env.oauth1 !== null, xApiBearer: env.bearerToken !== null, executor: env.executorKey !== null },
  rettiwtKeyCookies: env.rettiwtApiKey ? rettiwtKeyCookieNames(env.rettiwtApiKey) : [],
  missing: env.missing,
}));
for (const way of candidates(env)) {
  const one = await chooseReader(env, [way]);
  console.log(safe({ way: way.describe(), ok: one.state.ok, block: one.state.block, detail: one.state.detail, botId: one.botId }));
}
const chosen = await chooseReader(env);
console.log(safe({ chosen: chosen.state }));
process.exit(0);
