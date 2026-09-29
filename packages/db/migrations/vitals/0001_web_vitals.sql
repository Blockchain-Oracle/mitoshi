-- Field Core Web Vitals (plan §3.1, D-071): what real visitors measured, beaconed by the web app after each page load.
-- Replaces Vercel Speed Insights on Coolify (D-061); S19 reads p75 per route at each deploy. No identifiers: route
-- template, metric, value, rating, navigation type, network, time.
create table if not exists web_vitals (
  id bigserial primary key,
  route text not null,
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value double precision not null,
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  navigation_type text not null,
  network text not null,
  created_at_ms bigint not null
);
create index if not exists web_vitals_route_metric on web_vitals (route, metric, created_at_ms);
