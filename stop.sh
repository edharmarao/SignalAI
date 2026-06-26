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

get_pids_on_port() {
  local port="$1"
  local pids=""
  if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32" ]]; then
    # Windows netstat output line ends with the PID
    pids=$(netstat.exe -ano | grep -E "LISTENING|ESTABLISHED" | grep -E ":${port}\s" | awk '{print $NF}' | tr -d '\r' | sort -u || true)
  else
    if command -v lsof >/dev/null 2>&1; then
      pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
    fi
    if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
      pids=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' || true)
    fi
    if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
      pids=$(fuser "${port}/tcp" 2>/dev/null || true)
    fi
  fi
  echo "$pids"
}

kill_port() {
  local port="$1"
  local pids
  pids=$(get_pids_on_port "$port")
  if [ -n "$pids" ]; then
    log "Killing processes on port $port: $pids"
    for pid in $pids; do
      if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32" ]]; then
        MSYS_NO_PATHCONV=1 taskkill.exe /F /PID "$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
      else
        kill "$pid" 2>/dev/null || kill -9 "$pid" 2>/dev/null || true
      fi
    done
  fi
}

log "=== SignalAI Stop ==="

# ── Kill by PID file (and their process groups) ───────────────────────────────
if [ -f "$PID_FILE" ]; then
  log "Reading PIDs from $PID_FILE …"
  while IFS= read -r pid; do
    pid=$(echo "$pid" | tr -d '\r')
    if [ -n "$pid" ]; then
      if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32" ]]; then
        MSYS_NO_PATHCONV=1 taskkill.exe /F /PID "$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
      else
        if kill -0 "$pid" 2>/dev/null; then
          log "Stopping PID $pid (and its process group) …"
          pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)
          if [ -n "$pgid" ] && [ "$pgid" != "0" ]; then
            kill -- -"$pgid" 2>/dev/null || kill "$pid" 2>/dev/null || true
          else
            kill "$pid" 2>/dev/null || true
          fi
        fi
      fi
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
API_RUNNING=$(get_pids_on_port "$API_PORT")
WEB_RUNNING=$(get_pids_on_port "$WEB_PORT")

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
