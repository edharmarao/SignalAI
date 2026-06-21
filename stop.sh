#!/usr/bin/env bash
# =============================================================================
# stop.sh — SignalAI remote host stop script
# Usage: ./stop.sh
#   - Kills API and Web processes recorded in .pids
#   - Also kills anything on the configured ports as fallback
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
PID_FILE="$REPO_DIR/.pids"

# ── Load .env.prod for port numbers ───────────────────────────────────────────
if [ -f "$REPO_DIR/.env.prod" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env.prod"
  set +o allexport
fi

API_PORT="${API_PORT:-8003}"
WEB_PORT="${PORT:-3003}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

kill_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    log "Killing processes on port $port: $pids"
    echo "$pids" | xargs kill 2>/dev/null || true
    sleep 2
    # SIGKILL any survivors
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
      log "Force-killing survivors on port $port: $pids"
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
  fi
}

log "=== SignalAI Stop ==="

# ── Kill by PID file (and their process groups) ───────────────────────────────
if [ -f "$PID_FILE" ]; then
  log "Reading PIDs from $PID_FILE …"
  while IFS= read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      log "Stopping PID $pid (and its process group) …"
      # Kill the whole process group so child workers die too
      pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
      if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
        kill -- -"$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
      else
        kill "$pid" 2>/dev/null || true
      fi
    else
      log "PID $pid — not running (skipping)"
    fi
  done < "$PID_FILE"
  rm -f "$PID_FILE"
  log "PID file removed."
else
  log "No .pids file found — falling back to port scan."
fi

sleep 1

# ── Kill by port — catches any workers the PID kill missed ────────────────────
kill_port "$API_PORT"
kill_port "$WEB_PORT"

sleep 1

# ── Confirm ───────────────────────────────────────────────────────────────────
API_RUNNING=$(lsof -ti tcp:"$API_PORT" 2>/dev/null || true)
WEB_RUNNING=$(lsof -ti tcp:"$WEB_PORT" 2>/dev/null || true)

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        SignalAI — Stop Summary           ║"
echo "╠══════════════════════════════════════════╣"
if [ -z "$API_RUNNING" ]; then
  printf "║  API  port %-5s  ✅ Stopped             ║\n" "$API_PORT"
else
  printf "║  API  port %-5s  ⚠ Still running (%-5s)║\n" "$API_PORT" "$API_RUNNING"
fi
if [ -z "$WEB_RUNNING" ]; then
  printf "║  Web  port %-5s  ✅ Stopped             ║\n" "$WEB_PORT"
else
  printf "║  Web  port %-5s  ⚠ Still running (%-5s)║\n" "$WEB_PORT" "$WEB_RUNNING"
fi
echo "╚══════════════════════════════════════════╝"
