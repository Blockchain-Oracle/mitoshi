# Prompt for Codex — investigate the out-of-memory crashes on the Coolify server `agari-box`

You are investigating why the owner's self-hosted Coolify server keeps running out of memory. Find the root cause(s),
prove them with evidence, and propose concrete fixes. **Investigate read-only first; do not restart, stop, redeploy,
delete or reconfigure anything on the server without the owner's explicit go** — several live projects run there.

## Access
- SSH: `ssh agari-box` (root; host 84.46.247.92; key `~/.ssh/id_ed25519`, already in `~/.ssh/config`).
- Coolify 4.3.23 (Laravel 12.65.0). Its API/dashboard is only reachable through a tunnel:
  `ssh -f -N -o ServerAliveInterval=30 -L 8001:localhost:8000 agari-box`, then the `coolify` CLI with context
  `agari-new` (http://localhost:8001). `coolify resources list`, `coolify app get <uuid> --format json`,
  `coolify app deployments list <uuid>`. Never print secrets (API tokens, env values, webhook secrets).

## What was observed (2026-09-29)
- Host: 4 vCPU, **7.8 GiB RAM, no swap**, kernel 6.8.0-139, disk 145 G (60 % used).
- At ~12:41 server time (probably CEST = 10:41 UTC) the box hit a **global OOM**: `php invoked oom-killer … global_oom
  … Killed process (systemd)`. Load average spiked to **~184** (15-min average still 45 half an hour later). A
  Node container (Mitoshi ops, `8iaimzcz5gcmont5hqbm6yhk-…`) restarted at 10:43:14 UTC (RestartCount 1,
  OOMKilled=false). An earlier global OOM on **2026-09-27 02:13–02:17** killed a `node` process
  (total-vm 44 GB, anon-rss 464 MB) and a systemd process.
- At rest afterwards: ~5.2 GB used, ~195 MB free, ~3.4 GB buff/cache, ~2.7 GB available. The `coolify` container was
  at **136 % CPU** in one sample.
- **No container has a memory limit** except `logos-kit` sequencer (1.5 GB) and drip (256 MB).
- Largest containers at rest (docker stats): `rvqdneldfqkhjtywhlzlqnn1-…` 617 MiB, `cxpo6uaqrvfcjbfyesyvkb6s`
  487 MiB, `303mkwitemt1aefoawsxzi9k-…` 420 MiB, `coolify` 414 MiB, Mitoshi ops 375 MiB, Agari ops 370 MiB, logos-kit
  sequencer 305 MiB, Agari web 258 MiB, … (~4.4 GB total across ~30 containers).
- Projects on the box (Coolify): masayume, agari, shijima, ruckus, our-journal, baku, logos-kit, mitoshi — several
  Next.js apps (`next-server` processes), Node workers, ~7 Postgres instances, Redis, the Coolify stack
  (coolify, coolify-db, coolify-redis, coolify-realtime, coolify-proxy/Traefik, coolify-sentinel).
- Builds: Coolify builds images **on this same box** (Dockerfile builds of Next.js monorepos with pnpm; Next builds
  are memory-hungry). Several projects were being deployed via the Coolify CLI during the day.

## What to find out
1. **What consumed memory at the moments of the OOMs** (27 Sep ~02:13–02:17 and 29 Sep ~12:41 server time): the
   kernel's OOM report in `journalctl -k`/`dmesg` lists per-process RSS at kill time — read the full reports. Cross-
   reference Coolify's deployment history (which builds were running then), `docker events`/container start times, and
   Coolify's own logs (`/data/coolify/…`, `docker logs coolify`) for queue workers, horizon, scheduled tasks, and
   sentinel metrics.
2. **Is a build the trigger?** Check concurrent builds, BuildKit memory, pnpm install + `next build` peaks, and
   whether Coolify runs builds without limits on the production host. Check the Coolify build server settings.
3. **Is something leaking?** Look for containers whose RSS grows over time (sample `docker stats` a few times; check
   Coolify Sentinel metrics history if enabled), Node processes with huge heaps, Postgres `shared_buffers`/
   `work_mem` per instance × 7, Redis maxmemory, and the Coolify PHP workers (136 % CPU sample, `php` invoked the OOM
   killer).
4. **Why the load hit ~184** (thrash without swap: reclaim/IO wait on file-backed pages) — confirm with `vmstat`,
   `/proc/pressure/memory`, `sar` if available.
5. Anything else unusual: zombie containers, stopped-but-running resources, old images/volumes, log files growing,
   cron jobs, duplicate Traefik instances.

## Deliverable
A written report (put it in `context/ops/agari-box-oom-report.md` in /Users/abu/dev/hackathon/crypto-world-fair and
show it to the owner) with: timeline of both OOMs with evidence; the root cause(s) ranked by confidence; per-project
memory budget at rest and at peak; and a prioritized fix list — e.g. swap file size + swappiness, per-container
memory limits in Coolify (suggested values per app from observed peaks), build-time limits or moving builds off the
host (build server / GitHub Actions + registry), Postgres/Redis tuning, Coolify worker settings, and whether the box
needs more RAM. For each fix: exact commands/settings, risk, and which projects it touches. Apply nothing until the
owner approves.
