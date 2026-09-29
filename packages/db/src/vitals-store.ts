/** Field Web Vitals over Postgres (`web_vitals`, D-071): samples in, p75 per route and metric out. */
import type { Sql } from "./index";

export const VITAL_METRICS = ["LCP", "INP", "CLS", "FCP", "TTFB"] as const;
export type VitalMetric = (typeof VITAL_METRICS)[number];

export interface VitalSample {
  route: string;
  metric: VitalMetric;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  navigationType: string;
  network: string;
  createdAtMs: number;
}

export interface VitalSummary {
  route: string;
  metric: VitalMetric;
  p75: number;
  samples: number;
  goodShare: number;
}

export interface VitalsStore {
  save(samples: readonly VitalSample[]): Promise<void>;
  summary(sinceMs: number, network: string): Promise<VitalSummary[]>;
}

export function createPgVitalsStore(sql: Sql): VitalsStore {
  return {
    async save(samples) {
      if (samples.length === 0) return;
      await sql`insert into web_vitals ${sql(samples.map((s) => ({ route: s.route, metric: s.metric, value: s.value, rating: s.rating, navigation_type: s.navigationType, network: s.network, created_at_ms: s.createdAtMs })))}`;
    },
    async summary(sinceMs, network) {
      const rows = await sql<{ route: string; metric: VitalMetric; p75: number; samples: string; good: string }[]>`
        select route, metric, percentile_cont(0.75) within group (order by value) as p75, count(*)::text as samples,
          count(*) filter (where rating = 'good')::text as good
        from web_vitals where created_at_ms >= ${sinceMs} and network = ${network}
        group by route, metric order by route, metric`;
      return rows.map((r) => ({ route: r.route, metric: r.metric, p75: Number(r.p75), samples: Number(r.samples), goodShare: Number(r.good) / Number(r.samples) }));
    },
  };
}
