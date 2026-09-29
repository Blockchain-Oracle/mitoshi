"use client";
/**
 * React side of the real-time client (D-040/D-049). `useStreamTopic` hears one topic through the page's shared
 * connection; `usePriceStream` writes every price tick into the query cache (`keys.price(symbol)`, stream-owned:
 * `staleTime: Infinity`, never fetched) once per frame, so any component reads a live price with `usePrice`.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { isPriceTick, subscribeTopic, type PriceTick, type StreamEvent } from "../runtime/stream-hub";
import { keys } from "./keys";

export function useStreamTopic(topic: string | null, onEvents: (events: StreamEvent[]) => void): void {
  const handler = useRef(onEvents);
  useEffect(() => {
    handler.current = onEvents;
  });
  useEffect(() => (topic ? subscribeTopic(topic, (events) => handler.current(events)) : undefined), [topic]);
}

export function usePriceStream(enabled = true): void {
  const queryClient = useQueryClient();
  useStreamTopic(enabled ? "prices" : null, (events) => {
    for (const e of events) if (e.event === "price" && isPriceTick(e.data)) queryClient.setQueryData(keys.price(e.data.symbol), e.data);
  });
}

export function usePrice(symbol: string): PriceTick | undefined {
  return useQuery<PriceTick>({ queryKey: keys.price(symbol), queryFn: () => new Promise<never>(() => undefined), enabled: false, staleTime: Infinity }).data;
}
