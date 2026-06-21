#!/usr/bin/env bash
# =============================================================================
# startup.sh — SignalAI remote host startup script
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$REPO_DIR/logs"
API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
PID_FILE="$REPO_DIR/.pids"

cd "$REPO_DIR"

# ── Helpers ───────────────────────────────────────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

kill_pid_file() {
  if [ -f "$PID_FILE" ]; then
    while IFS= read -r pid; do
      if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        log "Stopping PID $pid …"
        kill "$pid" 2>/dev/null || true
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
}

kill_by_port() {
  local port="$1"
  local pid
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [ -n "$pid" ]; then
    log "Killing existing process on port $port (PID $pid)"
    kill "$pid" 2>/dev/null || true
    sleep 1
  fi
}

# ── Load .env.prod ─────────────────────────────────────────────────────────────
if [ -f "$REPO_DIR/.env.prod" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$REPO_DIR/.env.prod"
  set +o allexport
else
  echo "[startup] ERROR: .env.prod not found at $REPO_DIR/.env.prod"
  exit 1
fi

GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_USER="${GITHUB_USER:-edharmarao}"
API_PORT="${API_PORT:-8003}"
WEB_PORT="${PORT:-3003}"

# ── Step 1: Stop any running instances ────────────────────────────────────────
log "=== SignalAI Startup ==="
log "Stopping any running instances …"
kill_pid_file
kill_by_port "$API_PORT"
kill_by_port "$WEB_PORT"
sleep 1

# ── Step 2: Pull latest code ───────────────────────────────────────────────────
log "Pulling latest code from GitHub …"
if [ -n "$GITHUB_TOKEN" ] && [ "$GITHUB_TOKEN" != "your_personal_access_token_here" ]; then
  REMOTE_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/SignalAI.git"
  git remote set-url origin "$REMOTE_URL" 2>/dev/null || true
fi

git fetch origin main
git reset --hard origin/main
log "Code updated to: $(git log --oneline -1)"

# Remove token from remote URL after pull (security)
git remote set-url origin "https://github.com/${GITHUB_USER}/SignalAI.git" 2>/dev/null || true

# ── Resolve Node/npm (nvm, fnm, system, common paths) ─────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh" --no-use 2>/dev/null || true
command -v fnm >/dev/null 2>&1 && eval "$(fnm env)" 2>/dev/null || true

for NODE_PATH_HINT in \
  /usr/local/bin /usr/bin \
  "$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node/" 2>/dev/null | sort -V | tail -1)/bin" \
  "$HOME/.local/bin" /opt/homebrew/bin /snap/bin; do
  [ -d "$NODE_PATH_HINT" ] && export PATH="$NODE_PATH_HINT:$PATH"
done

NPM_CMD=$(command -v npm 2>/dev/null || true)
NODE_CMD=$(command -v node 2>/dev/null || true)

if [ -z "$NPM_CMD" ]; then
  log "ERROR: npm not found. Install Node.js first:"
  log "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  log "  sudo apt-get install -y nodejs"
  exit 1
fi
log "Node: $NODE_CMD ($($NODE_CMD --version 2>/dev/null || echo '?'))  npm: $NPM_CMD ($($NPM_CMD --version 2>/dev/null || echo '?'))"

# ── Step 3: Create log directory ───────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Step 4: Install / update API dependencies ─────────────────────────────────
log "Installing API dependencies …"
API_DIR="$REPO_DIR/apps/api"
VENV_DIR="$API_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
  log "Creating Python venv at $VENV_DIR"
  python3 -m venv "$VENV_DIR"
fi

"$VENV_DIR/bin/pip" install -q --upgrade pip
"$VENV_DIR/bin/pip" install -q -r "$API_DIR/requirements.txt"
log "API dependencies installed."

# ── Step 5: Install / build Web dependencies ─────────────────────────────────
log "Installing Web dependencies …"
WEB_DIR="$REPO_DIR/apps/web"
cd "$WEB_DIR"

# Use npm ci for reproducible installs, fall back to npm install
if [ -f "package-lock.json" ]; then
  "$NPM_CMD" ci --silent 2>&1 | tail -3
else
  "$NPM_CMD" install --silent 2>&1 | tail -3
fi

log "Building Next.js app …"
"$NPM_CMD" run build 2>&1 | tail -5
log "Web build complete."

cd "$REPO_DIR"

# ── Step 6: Start API ─────────────────────────────────────────────────────────
log "Starting API on port $API_PORT …"
nohup "$VENV_DIR/bin/uvicorn" app.main:app \
  --host 0.0.0.0 \
  --port "$API_PORT" \
  --workers 2 \
  --log-level info \
  2>&1 >> "$API_LOG" &
API_PID=$!
echo "$API_PID" > "$PID_FILE"
log "API started (PID $API_PID)"

# ── Step 7: Start Web ─────────────────────────────────────────────────────────
log "Starting Web on port $WEB_PORT …"
cd "$WEB_DIR"
nohup "$NPM_CMD" run start 2>&1 >> "$WEB_LOG" &
WEB_PID=$!
echo "$WEB_PID" >> "$PID_FILE"
cd "$REPO_DIR"
log "Web started (PID $WEB_PID)"

# ── Step 8: Health check ───────────────────────────────────────────────────────
log "Waiting for services to come up …"
sleep 5

API_OK=false
WEB_OK=false

for i in 1 2 3 4 5; do
  if curl -sf "http://localhost:${API_PORT}/api/v1/health" > /dev/null 2>&1 || \
     curl -sf "http://localhost:${API_PORT}/api/v1/charts/symbols" > /dev/null 2>&1; then
    API_OK=true; break
  fi
  sleep 3
done

for i in 1 2 3; do
  if curl -sf "http://localhost:${WEB_PORT}" > /dev/null 2>&1; then
    WEB_OK=true; break
  fi
  sleep 3
done

# ── Summary ────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              SignalAI — Startup Summary                  ║"
echo "╠══════════════════════════════════════════════════════════╣"
printf "║  API  (PID %-6s)  port %-5s  %s\n" \
  "$API_PID" "$API_PORT" "$( $API_OK && echo '✅ UP' || echo '⚠ check log' )  ║"
printf "║  Web  (PID %-6s)  port %-5s  %s\n" \
  "$WEB_PID" "$WEB_PORT" "$( $WEB_OK && echo '✅ UP' || echo '⚠ check log' )  ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Logs:                                                   ║"
printf "║    API → %-48s║\n" "$API_LOG"
printf "║    Web → %-48s║\n" "$WEB_LOG"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  To stop:  ./stop.sh                                     ║"
echo "║  Tail API: tail -f $API_LOG"
echo "║  Tail Web: tail -f $WEB_LOG"
echo "╚══════════════════════════════════════════════════════════╝"
