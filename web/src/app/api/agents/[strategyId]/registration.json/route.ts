import { connection } from "next/server";
import { agentRegistrationResponse } from "@/lib/server/agent-registration";
import { webSql } from "@/lib/server/db";

/** The ERC-8004 registration file for one strategy's agent (its on-chain `agentURI`). */
export async function GET(request: Request, { params }: { params: Promise<{ strategyId: string }> }): Promise<Response> {
  await connection();
  const { strategyId } = await params;
  const origin = process.env.APP_ORIGIN ?? new URL(request.url).origin;
  return agentRegistrationResponse(webSql(), strategyId, origin);
}
