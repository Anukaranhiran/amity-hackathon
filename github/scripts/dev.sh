#!/usr/bin/env bash
# Shulker one-command launcher.
#   npm run dev          # sandbox + backend + dashboard
#   npm run dev:api      # sandbox + backend only (headless demo)
set -euo pipefail
cd "$(dirname "$0")/.."

NO_WEB=0
for arg in "$@"; do
  [ "$arg" = "--no-web" ] && NO_WEB=1
done

command -v node >/dev/null || { echo "node >= 20.10 required"; exit 1; }

PIDS=()
cleanup() {
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
}
trap cleanup EXIT INT TERM

echo "[shulker] starting ShulkerLab sandbox on :8700 (deliberately vulnerable, loopback only)…"
SHULKERLAB_STANDALONE=1 node --experimental-strip-types --no-warnings --env-file-if-exists=.env apps/sandbox/src/server.ts &
PIDS+=($!)

sleep 1
echo "[shulker] starting scanner backend on :8600…"
node --experimental-strip-types --no-warnings --env-file-if-exists=.env apps/scan-api/src/server.ts &
PIDS+=($!)

sleep 1
if [ "$NO_WEB" = "1" ]; then
  echo "[shulker] API ready. Try: curl -s localhost:8600/health"
  echo "[shulker] demo: curl -s -X POST localhost:8600/api/demo"
  wait
else
  echo "[shulker] starting dashboard on :5173…"
  (cd apps/web && npx vite --port 5173 --strictPort) &
  PIDS+=($!)
  echo ""
  echo "  Dashboard : http://localhost:5173"
  echo "  Backend   : http://localhost:8600/health"
  echo "  Sandbox   : http://localhost:8700/health  (deliberately vulnerable — loopback only)"
  echo ""
  wait
fi
