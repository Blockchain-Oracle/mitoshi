import { describe, expect, it } from "vitest";
import { createSql, runMigrations, upsertAgentRegistration } from "@cwf/db";
import { agentRegistrationResponse } from "./agent-registration";

describe("/api/agents/<strategyId>/registration.json", () => {
  it("404s an id that is not a strategy id and 503s without a database", async () => {
    expect((await agentRegistrationResponse(null, "../etc", "https://testnet.mitoshi.xyz", "testnet")).status).toBe(404);
    expect((await agentRegistrationResponse(null, "ok-id", "https://testnet.mitoshi.xyz", "testnet")).status).toBe(503);
  });

  // Runs against a real Postgres when TEST_DATABASE_URL is set (S3.5 ran it on a local Postgres 16).
  it.skipIf(!process.env.TEST_DATABASE_URL)("serves the file for a recorded agent and 404s an unknown strategy", async () => {
    const sql = createSql(process.env.TEST_DATABASE_URL);
    try {
      await runMigrations(sql);
      await upsertAgentRegistration(sql, { chainId: 42431, agentId: 999_001n, strategyId: "vitest-agent", owner: "0x900a0F5260b91Fd65D0C2b03D92Cf8013a1F073e", name: "n", description: "d", image: "https://testnet.mitoshi.xyz/api/agents/vitest-agent/image.svg", agentUri: "data:application/json,{}", active: true, registerTx: "0x00" });
      const ok = await agentRegistrationResponse(sql, "vitest-agent", "https://testnet.mitoshi.xyz", "testnet");
      expect(ok.status).toBe(200);
      expect(await ok.json()).toMatchObject({ registrations: [{ agentId: 999001, agentRegistry: "eip155:42431:0x8004A818BFB912233c491871b3d84c89A494BD9e" }] });
      expect((await agentRegistrationResponse(sql, "nobody", "https://testnet.mitoshi.xyz", "testnet")).status).toBe(404);
      await sql`delete from agent_registrations where strategy_id = 'vitest-agent'`;
    } finally {
      await sql.end();
    }
  });
});
