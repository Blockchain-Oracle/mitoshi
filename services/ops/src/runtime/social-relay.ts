/**
 * The social layer's live push (S13, D-049): the web writes a room message or a take, then `NOTIFY social` with
 * `{topic, event, data}`; this LISTENs and publishes it on the stream, so every open room and feed gets it at once.
 * Only the `rooms` and `takes` topics are relayed — a payload naming any other topic is dropped.
 */
import type { Sql } from "@cwf/db";
import type { Bus } from "./bus";

const RELAYED = new Set(["rooms", "takes"]);

export function relaySocial(payload: string, bus: Pick<Bus, "publish">): boolean {
  let p: { topic?: unknown; event?: unknown; data?: unknown };
  try {
    p = JSON.parse(payload) as typeof p;
  } catch {
    return false;
  }
  if (typeof p.topic !== "string" || !RELAYED.has(p.topic) || typeof p.event !== "string") return false;
  bus.publish(p.topic, p.event, p.data);
  return true;
}

export async function listenSocial(sql: Sql, bus: Pick<Bus, "publish">, log: (why: string) => void): Promise<void> {
  await sql.listen("social", (payload) => void relaySocial(payload, bus), () => log("listening on social"));
}
