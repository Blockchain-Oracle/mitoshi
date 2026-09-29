# `agari-box` out-of-memory investigation

Investigated 2026-09-29. **Read-only investigation:** no server configuration, container, deployment, or data was changed. Server timestamps below are CEST (UTC+02:00); subtract two hours for UTC. The host is Coolify 4.3.23 on Ubuntu kernel 6.8.0-139, with 4 vCPUs, 7.755 GiB usable RAM, no swap, and 58 GiB free on an ext4 root filesystem.

## Finding

**High confidence: builds on the production host exhausted memory.** Both OOMs coincide with Agari Dockerfile/Next.js builds. On 27 Sep, Coolify ran **Agari web and Agari docs concurrently**. On 29 Sep, **Agari web alone** was building and its `next-build` process held 2,160 MiB anonymous RSS at the kernel snapshot. The application fleet consumes about **4.5 GiB in container memory while idle**; the kernel and build subprocesses need additional headroom. Coolify allows two concurrent builds on this host, and the recorded `docker build` commands had no memory or CPU limit flag. This is why a second build is especially dangerous, but the 29 Sep event proves that serializing builds alone is insufficient.

The failure mode was **global OOM**, not a configured container memory limit. The kernel chose a small `systemd` user process (about 2–5 MiB RSS) at both incidents; this did not relieve the pressure. On 27 Sep it also killed an unmapped Node process at 453 MiB anonymous RSS, and Docker restarted that container after exit 137. On 29 Sep the Agari and Mitoshi ops containers exited with code 70 and restarted during the stall; Docker reports `OOMKilled=false`, so these were collateral failures, not direct cgroup OOM kills. `php` and `dockerd` were allocation callers, **not evidence that Coolify PHP or Docker caused the memory growth**.

## Timeline and evidence

| Server time | Evidence |
| --- | --- |
| **27 Sep 02:03–02:20** | Coolify deployment **137** (`agari-web`, commit `661a24eec7`) ran 02:03:04–02:19:58. Deployment **138** (`agari-docs`, same commit) ran 02:03:07–02:18:49. Both logs show `next build`. |
| **27 Sep 02:17:02–02:17:44** | Kernel: `dockerd invoked oom-killer`, then `global_oom`. The process table contains `node` PID 4074957 **1,357 MiB**, `next-build` PID 4074978 **1,313 MiB**, and another `next-build` PID 4067173 **643 MiB** anonymous RSS. These three processes together used **3,313 MiB**. The Node process had the same `oom_score_adj=-500` as the build processes; its exact parent/container is no longer available. Kernel killed `systemd` PID 8086 (1.9 MiB anonymous RSS), then `node` PID 3805261 (453 MiB anonymous RSS, 44 GB *virtual address space*, not 44 GB physical RAM). Docker recorded the Node container's exit 137 and restart. |
| **27 Sep 02:17:42** | `sar`: only **~460 MiB available**, run queue **68**, 1-minute load **205.98**, ~4,497 major faults/sec, 51.31% system CPU and 24.97% I/O wait. Kernel snapshot reported just ~7.9 MiB active/inactive file pages and zero swap. |
| **29 Sep 12:25–12:46** | Coolify deployment **201** (`agari-web`, commit `c9d9167d6d`) ran 12:25:43–12:46:38. Its Docker build started at 12:26:21; log reached `next build` at 12:27:25. Agari ops deployment 200 had already finished at 12:27:27; no other deployment in the API list overlapped the OOM. |
| **29 Sep 12:35:55** | Before the kernel OOM log, `sar` already showed **107 MiB available**, run queue **233**, 1-minute load **260**, 22 blocked tasks, and 3,028 major faults/sec. Sentinel was timing out talking to Docker by 12:40. |
| **29 Sep 12:41:23–12:43:12** | Kernel: `php invoked oom-killer`, `global_oom`. The process table contains `next-build` PID 2585846 at **2,160 MiB anonymous RSS**, the largest process. Other large running processes included Shijima web `next-server` at **514 MiB**, Shijima worker `MainThread` at **306 MiB**, and the logos-kit sequencer at **248 MiB**. The kernel killed `systemd` PID 4079597 (2.3 MiB anonymous RSS). File-backed active/inactive pages had fallen to ~1.6 MiB; no swap existed. |
| **29 Sep 12:42:54–12:43:14** | `sar`: **~105 MiB available**, run queue **203**, load **256.54**, **53 blocked tasks**, 5,574 major faults/sec, **99.39% system CPU**. Docker reported widespread health-check timeouts. Agari ops and Mitoshi ops exited 70 and restarted at 12:43:14; both currently show one restart and `OOMKilled=false`. |
| **29 Sep 12:50:03** | Available memory recovered to ~2.68 GiB and the run queue fell to 5 after the peak passed. Agari web deployment eventually finished successfully. |

The extreme load was memory reclaim and page refaulting, not a 200-process application workload on four CPUs. At 29 Sep 12:42 the kernel spent nearly all CPU time in system mode while file cache was nearly empty; on 27 Sep it also spent a quarter of CPU time in I/O wait. With no swap, reclaim repeatedly evicted and reread file-backed pages. The delayed kernel and Docker log timestamps, health-check timeouts, and Sentinel Docker timeouts are consistent with this stall.

### Causes ranked by confidence

1. **High — local Dockerfile/Next.js builds on a crowded host.** Deployment windows match both OOMs, and the kernel snapshots show 1.96 GiB of `next-build` processes on 27 Sep and 2.16 GiB on 29 Sep. The additional 1.36 GiB Node process on 27 Sep is plausibly build-related, but its identity is not independently recoverable.
2. **High — inadequate burst headroom and no swap.** The 7.755 GiB host carries ~4.5 GiB of resting containers, has no swap or build memory cap, and allows two builds at once. The available-memory and reclaim data demonstrate saturation. Build tasks in the OOM tables had `oom_score_adj=-500`, while the small `systemd` victims had `+100`, making the chosen kills ineffective at freeing substantial memory.
3. **Medium — unrelated runtime failures were effects of the stall.** Docker health checks timed out broadly; both ops services restarted at the OOM with exit 70. Their precise exit paths may include application watchdogs or failed dependencies, but the timing and `OOMKilled=false` rule out a direct container-limit kill.
4. **Unproven — a long-running leak or database/Redis/PHP runaway.** No historical container memory series exists, and a 35-second post-incident sample is too short to exclude a slow leak. At the OOM snapshots, build processes dominate; PHP, Postgres, and Redis are not shown consuming comparable memory.

### Evidence locations and repeatable read-only commands

The underlying records remain on the host and in Coolify. These commands select only non-secret fields:

```sh
ssh agari-box 'journalctl -k --since "2026-09-27 02:16:50" --until "2026-09-27 02:18:00" --no-pager -o short-iso'
ssh agari-box 'journalctl -k --since "2026-09-29 12:41:00" --until "2026-09-29 12:44:00" --no-pager -o short-iso'
ssh agari-box 'sar -r -f /var/log/sysstat/sa29 -s 12:20:00 -e 12:50:00'
ssh agari-box 'sar -q -f /var/log/sysstat/sa29 -s 12:20:00 -e 12:50:00'
ssh agari-box 'sar -B -f /var/log/sysstat/sa29 -s 12:20:00 -e 12:50:00'
ssh agari-box 'sar -u ALL -f /var/log/sysstat/sa29 -s 12:20:00 -e 12:50:00'
coolify app deployments list kcwqrvdgskhyhlcly5tlhlzi --context agari-new --format json # agari-web; avoid printing raw logs/env
coolify app deployments list jpmw4nk5g05dhaiinsbvx4ga --context agari-new --format json # agari-docs; avoid printing raw logs/env
ssh agari-box 'docker stats --no-stream --format "{{.Name}}|{{.MemUsage}}"'
```

Deployment API logs can include build arguments; inspect or redact them before sharing.

## Memory budget

Snapshot at ~29 Sep 13:16 CEST, outside a build. Values are sums of `docker stats --no-stream` container memory, rounded to MiB; this is **not** the same measure as summing every process RSS. Two database proxy containers were assigned to their associated projects. Host `MemAvailable` was ~2.5–2.7 GiB. The Docker fleet total was **~4,625 MiB**; the remainder includes host/kernel processes and reclaimable cache, so it is not all committed use. The three samples over ~35 seconds did not show a sustained rise in the large services: Shijima web 611–614 MiB, worker 419 MiB, Agari ops 412–416 MiB, Mitoshi ops 394–395 MiB, Coolify ~360 MiB. That short sample does **not** rule out a slower leak.

| Project | Resting container budget | Largest measured containers | Historical peak evidence |
| --- | ---: | --- | --- |
| Shijima | ~1,308 MiB | web 612, worker 419, docs 213, DB 64 | Web process 514 MiB anonymous RSS in 29 Sep OOM table; full project peak not recorded. |
| Agari | ~1,103 MiB | ops 409, DB 288, web 206, docs 196, DB proxy 4 | 29 Sep web `next-build` alone **2,160 MiB**. 27 Sep web/docs `next-build` processes together **1,956 MiB**, plus a 1,357 MiB Node process likely associated with a build but not safely attributable. Full project peak not recorded. |
| Mitoshi | ~700 MiB | ops 394, web 163, DB 137, Redis 7 | Not recorded. |
| Coolify stack | ~566 MiB | Coolify 347, proxy 75, realtime 68, DB 51, Redis 12, sentinel 14 | PHP processes totaled only ~147 MiB anonymous RSS in the 29 Sep kernel table; full stack peak not recorded. |
| Baku | ~344 MiB | worker 148, Postgres 98, skill 56, deploy hook 43 | Not recorded. |
| Logos-kit | ~279 MiB | sequencer ~270, drip ~9 | Sequencer process 248 MiB anonymous RSS at 29 Sep OOM; full project peak not recorded. |
| Our Journal | ~161 MiB | app 133, DB 28 | Not recorded. |
| Ruckus | ~84 MiB | server 84 | Not recorded. |
| Masayume | ~79 MiB | DB 74, DB proxy 5 | Not recorded. |

These rows are **runtime use**, not reserved capacity. A new deployment temporarily adds build processes while old application containers remain running. At the 29 Sep OOM, the kernel's task table summed to ~6.7 GiB anonymous RSS, before shared/kernel memory. The build's 2.16 GiB process alone was nearly all the 2.5–2.7 GiB `MemAvailable` seen at rest. On 27 Sep, the two Next builds plus the large Node process used ~3.3 GiB.

**Historical per-project maxima cannot be recovered from current telemetry.** Coolify `server_settings` has `is_metrics_enabled=false`, while Sentinel is enabled. Its local SQLite database contains disk records but zero CPU or memory rows, and Sentinel logged repeated Docker timeouts at the incident and subsequent `401 Invalid token` push failures. This is a monitoring gap, not a proven OOM cause. Record project/container memory through representative traffic and a deployment before treating any limit below as safe.

## Other checks

- **Runtime limits:** all running containers are unlimited in `HostConfig.Memory` except the logos-kit sequencer (1.5 GB) and drip (256 MB). Agari application's Coolify `limits_memory` is `0`. Docker's default is unbounded host memory unless a limit is set.
- **Build concurrency:** Coolify `server_settings.concurrent_builds=2`, `deployment_queue_limit=25`, on the single `localhost` server. The observed build commands used `DOCKER_BUILDKIT=1 docker build` without `--memory` or `--cpus` flags. Coolify's default is to build on the deployment server.
- **Postgres:** seven instances (including Coolify DB) each report `shared_buffers=128MB`, `work_mem=4MB`, `max_connections=100`; about 67 connections existed across them at inspection. There is no evidence that Postgres was the trigger, though seven independent buffers and connections add baseline cost. Do not sum process RSS for Postgres without accounting for shared pages.
- **Redis:** both Redis instances report `maxmemory=0` (unbounded), but used only ~12 MiB and ~7 MiB at the snapshot. Setting an eviction policy without confirming queue/session semantics could lose important data.
- **Coolify PHP:** the running Horizon supervisor allows up to four workers, with a 128 MB per-worker recycling setting. A previous 136% CPU sample and `php invoked oom-killer` identify activity/allocation under pressure, not a demonstrated PHP leak.
- **Host housekeeping:** one exited build container, zero zombie processes, and one Traefik instance. `docker system df` showed 23.08 GB reclaimable images and 13.72 GB reclaimable build cache, but disk is only 61% full; cleanup is not an OOM fix. Review volumes before any deletion (7.34 GB reported reclaimable). Root cron fired once in each incident window, with no evidence it drove the memory spike.

## Ranked causes and fixes requiring owner approval

| Priority | Action, setting, and affected projects | Benefit and risk |
| --- | --- | --- |
| **P0** | **Move builds off `agari-box`**. Add a dedicated Coolify build server, connect a registry, set each Dockerfile app's **General → Docker Image** registry path and **Use a Build Server?**, then deploy and verify the build log names that server and production pulls the resulting image. Start with Agari web/docs, then other source-built apps. Alternatively build in CI with `docker buildx build --push` and deploy a pinned registry image. | Removes multi-GB Next build peaks from this production host. Requires another machine/registry and a tested pull/auth path. Coolify can fall back to the deployment server if no build server is usable, so verify each deployment. A server marked as a build server cannot host the current apps. |
| **P0** | **Increase RAM to at least 16 GiB** if any source builds remain local; prefer 16 GiB even after offloading if these nine projects keep growing. Provider resize of `agari-box`; schedule and verify all live projects after the provider operation. | Resting containers are ~4.5 GiB; 8 GiB leaves inadequate build and cache headroom. Resize may reboot/interrupt every project and does not replace build isolation. 16 GiB is a capacity recommendation, not a measured production peak guarantee. |
| **P1, interim** | **Set Coolify concurrent builds to 1** on server UUID `7otp4kskhbwzkzybsug3uqgx`: dashboard **Servers → localhost → General → Concurrent Builds = 1**, or `coolify server update 7otp4kskhbwzkzybsug3uqgx --concurrent-builds 1 --context agari-new`. Applies to all projects. | Prevents the exact two-build overlap from 27 Sep. Deployments queue longer. **One build still caused the 29 Sep OOM**, so do not resume routine local builds solely on this change. |
| **P1, buffer** | **Add an 8 GiB swap file** on the existing ext4 root disk, set host `vm.swappiness=10`, and alert on sustained swap use. One-time commands below; affects all projects. | Gives the kernel a buffer while fixes are rolled out. Heavy swapping can make the box very slow and cause latency/timeouts; it is not extra RAM. Disk has ~58 GiB free now. |
| **P2** | **Introduce runtime limits only after load sampling.** In each Coolify application or database, use **Configuration → Resource Limits → Maximum Memory Limit** with provisional values below, then redeploy/restart one resource at a time and check traffic, metrics, health, and OOM events. Applies to the listed resource only. | Contains a runaway runtime container but does **not** limit the Dockerfile build and does not create RAM. A too-low hard limit will kill a live app or DB. Do this after build isolation/capacity, not as the sole fix. |
| **P2** | **Repair telemetry.** Enable Coolify resource metrics, investigate Sentinel's repeated `401 Invalid token` without exposing the token, and verify memory samples are stored and graphed. Applies to monitoring/control plane. | Supplies real runtime peaks and leak evidence for safe caps. Sentinel/metrics changes can briefly affect monitoring; do not rotate tokens blindly. |
| **P3** | **Review Postgres/Redis/worker tuning only with workload data.** Use `pg_stat_activity`, query latency, and Redis `INFO memory`/persistence before lowering `max_connections`, changing `shared_buffers`, setting `maxmemory`, or reducing Horizon workers. Applies to relevant DB/queue projects and Coolify. | Present settings contribute baseline but did not explain either sharp build-correlated event. A blanket DB or Redis limit can cause connection failures, eviction, or job loss. |

Swap commands proposed for an approved maintenance window (run once as root, after checking `/swapfile` and `/etc/fstab` for an existing entry):

```sh
ssh agari-box
test ! -e /swapfile && fallocate -l 8G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
grep -q '^/swapfile ' /etc/fstab || printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-swap-pressure.conf
sysctl -p /etc/sysctl.d/99-swap-pressure.conf
swapon --show
free -h
```

**Provisional runtime ceilings for a controlled trial, not measured safe peaks:** these are rounded above the observed resting cgroup use, not reservations. First collect traffic peaks and raise any ceiling that is too close to them. Set no new hard limit on the Coolify control-plane stack until its deployment/queue behavior is characterized.

| Project | Trial maximum memory per resource |
| --- | --- |
| Agari | web `768m`; docs `512m`; ops `768m`; DB `768m` |
| Shijima | web `1g`; worker `768m`; docs `512m`; DB `512m` |
| Mitoshi | web `512m`; ops `768m`; DB `512m`; Redis: decide only after key/data semantics review |
| Baku | worker `512m`; skill `256m`; deploy hook `256m`; Postgres `512m` |
| Logos-kit | keep existing sequencer `1.5g` and drip `256m`; verify representative load |
| Our Journal | app `512m`; DB `384m` |
| Ruckus | server `384m` |
| Masayume | DB `384m` |

These are independent ceilings; their sum is not a reserved RAM budget. Coolify's maximum swap setting is **total memory plus swap**; avoid setting it equal to maximum memory if the intention is to let the container use host swap. Follow each change with `docker inspect <container> --format '{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}'`, `docker stats`, and a representative user journey. Do not push caps to every production resource in one change.

## Sources for proposed settings

- [Coolify build and deployment model](https://coolify.io/docs/core/build-deployment-model): source builds occur on the deployment server by default.
- [Coolify build servers](https://coolify.io/docs/core/infrastructure/servers/build-servers): separate builder, registry, application settings, and fallback behavior.
- [Coolify application resource limits](https://coolify.io/docs/applications/configuration/resource-limits) and [database resource limits](https://coolify.io/docs/databases/configuration/resource-limits): field names, units, and need to recreate containers.
- [Coolify server update CLI](https://coolify.io/docs/cli/command-reference/commands/server/update): `--concurrent-builds` option.
- [Docker resource constraints](https://docs.docker.com/engine/containers/resource_constraints/): global OOM risk, memory/swap semantics, and runtime hard/soft limits.
- [Docker Buildx build resources](https://docs.docker.com/reference/cli/docker/buildx/build/): `--resource memory=...` limits individual BuildKit steps where supported; it is not a substitute for a separate builder and is not an option currently present in Coolify's recorded `docker build` invocation.
- [Linux kernel swappiness documentation](https://docs.kernel.org/admin-guide/sysctl/vm.html#swappiness): swappiness is workload dependent; `10` is a cautious initial value to validate, not an optimal value proved for this host.
