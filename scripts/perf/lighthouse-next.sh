#!/usr/bin/env bash
# `lighthouse.yml` branch mode (D-180): (re)starts `next start` for one built web directory on :3001 behind the one-origin
# proxy on :3000, waits for it, and warms every route twice (a deployed server has served them already).
#   scripts/perf/lighthouse-next.sh <web dir> <log file>
set -eu
dir="$1"
log="$2"
pkill -f "next start -p 3001" 2>/dev/null || true
pkill -f "next-server" 2>/dev/null || true
for _ in $(seq 1 30); do curl -s -o /dev/null http://127.0.0.1:3001/ || break; sleep 1; done
(cd "$dir" && NODE_ENV=production nohup pnpm exec next start -p 3001 > "$log" 2>&1 &)
for _ in $(seq 1 60); do curl -sf -o /dev/null http://localhost:3000/ && break; sleep 1; done
curl -sf -o /dev/null http://localhost:3000/ || { cat "$log"; exit 1; }
curl -sf "http://localhost:3000/api/index/markets?settled=1&limit=1" | head -c 200; echo
for _ in 1 2; do for r in $ROUTES; do curl -s -o /dev/null -w "%{http_code} %{time_total}s $r\n" "http://localhost:3000$r"; done; done
