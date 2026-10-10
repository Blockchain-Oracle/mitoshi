// `/api/sensei` (S13 step 8; Agari 03b30ab `app/api/sensei/route.ts`, now streamed): GET says whether Sensei is on and
// who would receive a question (the consent names them); POST answers one, token by token, as NDJSON (`stream.ts`).
// Server-side only: the credential never reaches the browser. Sensei reads and recommends; nothing here trades.
import { randomUUID } from "node:crypto";
import { streamText } from "ai";
import { withReceiptScope } from "@cwf/markets/server";
import { connection, NextResponse } from "next/server";
import { failureText } from "@/features/sensei/failure.server";
import { senseiModel } from "@/features/sensei/model.server";
import { asksForAdvice, SENSEI_ERRORS, senseiSystem, senseiTurnContext } from "@/features/sensei/prompt";
import { senseiRequestSchema, type SenseiRequest, type SenseiStatus } from "@/features/sensei/protocol";
import { clientIp, senseiGate } from "@/features/sensei/rate.server";
import { encodeEvent, SENSEI_CONSENT_VERSION, SENSEI_CONTENT_TYPE, type SenseiEvent } from "@/features/sensei/stream";
import { webEnv } from "@/lib/env";

export const maxDuration = 60;

/** A read is two to four sentences; the rest is room for the model's own thinking, which counts toward the cap. */
const MAX_OUTPUT_TOKENS = 16_000;
/** Chat is latency-sensitive: low effort, adaptive thinking (Opus 5.5 always thinks; effort is the lever). */
const REASONING = "low" as const;
const TOTAL_MS = 55_000;
const NO_STORE = { "cache-control": "no-store" };
const SYSTEM = senseiSystem(webEnv.markets.network);

const bad = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET() {
  // Read at request time: the answer is the server's configuration now, never one baked at build.
  await connection();
  const m = senseiModel();
  const body: SenseiStatus = {
    on: m !== null,
    provider: m?.resolved.providerName ?? null,
    recipients: m?.recipients ?? [],
    model: m?.resolved.modelId ?? null,
    network: webEnv.markets.network,
  };
  return NextResponse.json(body, { headers: NO_STORE });
}

export async function POST(req: Request) {
  const m = senseiModel();
  if (!m) return bad(SENSEI_ERRORS.notConfigured, 503);
  let body: SenseiRequest;
  try {
    const parsed = senseiRequestSchema.safeParse(await req.json());
    if (!parsed.success) return bad(SENSEI_ERRORS.badRequest, 400);
    body = parsed.data;
  } catch {
    return bad(SENSEI_ERRORS.badRequest, 400);
  }
  // The consent is per provider and version: a question agreed for one provider is never sent to another.
  if (body.consent.version !== SENSEI_CONSENT_VERSION || body.consent.provider !== m.resolved.providerName) {
    return bad(body.consent.provider === m.resolved.providerName ? SENSEI_ERRORS.consent : SENSEI_ERRORS.consentStale, 403);
  }
  if (body.messages.at(-1)?.role !== "user") return bad(SENSEI_ERRORS.badRequest, 400);
  if (!senseiGate(clientIp(req), Date.now())) return bad(SENSEI_ERRORS.rateLimited, 429);

  const { resolved } = m;
  const result = withReceiptScope({ senseiId: randomUUID() }, () =>
    streamText({
      model: resolved.model,
      system: SYSTEM,
      reasoning: REASONING,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      timeout: { totalMs: TOTAL_MS },
      abortSignal: req.signal,
      // Anthropic's own fallback when a safety classifier declines a turn (the API picks the model by category).
      ...(resolved.via === "direct" && resolved.providerName === "anthropic" ? { providerOptions: { anthropic: { fallbacks: "default" as const } } } : {}),
      messages: [
        // The volatile figures ride in their own first turn, after the stable system prompt.
        { role: "user", content: senseiTurnContext(body, asksForAdvice(body.messages)) },
        ...body.messages.map((msg) => ({ role: msg.role, content: msg.content })),
      ],
    }),
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: SenseiEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      let wrote = false;
      try {
        for await (const part of result.stream) {
          if (part.type === "text-delta" && part.text) {
            wrote = true;
            send({ t: "delta", v: part.text });
          } else if (part.type === "error") {
            send({ t: "error", m: failureText(part.error, resolved.providerName) });
            return;
          } else if (part.type === "finish") {
            if (part.finishReason === "content-filter") send(wrote ? { t: "done", refused: true } : { t: "error", m: SENSEI_ERRORS.refused });
            else if (!wrote) send({ t: "error", m: SENSEI_ERRORS.wentQuiet });
            else if (part.finishReason === "length") send({ t: "error", m: SENSEI_ERRORS.cutShort });
            else send({ t: "done" });
            return;
          }
        }
        if (!wrote) send({ t: "error", m: SENSEI_ERRORS.wentQuiet });
      } catch (error) {
        // The reader went away (closed the drawer, pressed Stop): nothing to say to anyone.
        if (!req.signal.aborted) send({ t: "error", m: failureText(error, resolved.providerName) });
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by a cancelled reader
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": SENSEI_CONTENT_TYPE, ...NO_STORE, "x-accel-buffering": "no" } });
}
