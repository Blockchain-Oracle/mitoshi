/**
 * Field Core Web Vitals (D-071; replaces Vercel Speed Insights on Coolify, D-061): web-vitals' buffered observers
 * capture LCP, CLS, INP, FCP and TTFB for the page load even though this module loads on idle, and the samples go to
 * `/api/vitals` in one beacon when the page is hidden. No identifiers leave the browser: route template, metric, value,
 * rating, navigation type.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from "web-vitals";
import { routeTemplate } from "@/lib/route-template";

let started = false;

export function startVitals(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  const route = routeTemplate(window.location.pathname);
  const queue = new Map<string, { route: string; metric: string; value: number; rating: string; navigationType: string }>();
  const keep = (m: Metric) => queue.set(m.name, { route, metric: m.name, value: m.value, rating: m.rating, navigationType: m.navigationType });
  const flush = () => {
    if (queue.size === 0) return;
    const body = JSON.stringify([...queue.values()]);
    queue.clear();
    if (!navigator.sendBeacon?.("/api/vitals", new Blob([body], { type: "application/json" }))) {
      void fetch("/api/vitals", { method: "POST", body, keepalive: true, headers: { "content-type": "application/json" } }).catch(() => undefined);
    }
  };
  onLCP(keep);
  onCLS(keep);
  onINP(keep);
  onFCP(keep);
  onTTFB(keep);
  document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
  window.addEventListener("pagehide", flush);
}
