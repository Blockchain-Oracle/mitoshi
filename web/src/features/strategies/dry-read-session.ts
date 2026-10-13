// Ported from Owarine 90a91d71:web/src/features/strategies/dry-read-session.ts (R4-6, D-227) — owns one draft's in-flight
// test read; cancellation also guards a provider that ignores AbortSignal. The route's own error line is shown as is.
import type { AgentPreviewRequest, AgentPreviewResponse } from "./protocol";

export type DryRead = { status: "idle" } | { status: "reading" } | { status: "ok"; result: AgentPreviewResponse } | { status: "error"; error: string };

const isPreview = (v: unknown): v is AgentPreviewResponse => !!v && typeof v === "object" && "market" in v && "gate" in v && "model" in v;

export function createDryReadSession(emit: (state: DryRead) => void, unreadable: string, fetcher: typeof fetch = fetch) {
  let generation = 0;
  let active: AbortController | null = null;
  const cancel = () => {
    generation += 1;
    active?.abort();
    active = null;
  };
  return {
    cancel,
    reset: () => {
      cancel();
      emit({ status: "idle" });
    },
    read: async (request: AgentPreviewRequest) => {
      cancel();
      active = new AbortController();
      const current = generation;
      emit({ status: "reading" });
      try {
        const response = await fetcher("/api/strategies/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request), signal: active.signal });
        const body: unknown = await response.json().catch(() => null);
        if (current !== generation) return;
        if (!response.ok) {
          const error = body && typeof body === "object" && typeof (body as { error?: unknown }).error === "string" ? (body as { error: string }).error : unreadable;
          emit({ status: "error", error });
          return;
        }
        emit(isPreview(body) ? { status: "ok", result: body } : { status: "error", error: unreadable });
      } catch {
        if (current === generation) emit({ status: "error", error: unreadable });
      }
    },
  };
}
