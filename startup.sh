#!/usr/bin/env bash
# =============================================================================
# startup.sh — SignalAI startup script (works locally and on remote host)
# =============================================================================
set -euo pipefail

REMOTE_IP="209.182.232.165"

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# ── Detect environment ────────────────────────────────────────────────────────
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || hostname -i 2>/dev/null || echo "")
if [ "${LOCAL_IP}" = "${REMOTE_IP}" ] || [ "${APP_ENV:-}" = "prod" ]; then
  IS_REMOTE=true
else
  IS_REMOTE=false
fi
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

get_pids_on_port() {
  local port="$1"
  local pids=""
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  fi
  if [ -z "$pids" ] && command -v ss >/dev/null 2>&1; then
    pids=$(ss -tlnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' || true)
  fi
  if [ -z "$pids" ] && command -v fuser >/dev/null 2>&1; then
    pids=$(fuser "${port}/tcp" 2>/dev/null || true)
  fi
  echo "$pids"
}

kill_by_port() {
  local port="$1"
  local pid
  pid=$(get_pids_on_port "$port")
  if [ -n "$pid" ]; then
    log "Killing existing process on port $port (PID $pid)"
    echo "$pid" | xargs kill 2>/dev/null || true
    sleep 2
    pid=$(get_pids_on_port "$port")
    if [ -n "$pid" ]; then
      log "Force-killing port $port (PID $pid)"
      echo "$pid" | xargs kill -9 2>/dev/null || true
      sleep 1
    fi
  fi
}

# ── Load env file ─────────────────────────────────────────────────────────────
if $IS_REMOTE; then
  ENV_FILE="$REPO_DIR/.env.prod"
  log "Running on remote host ($REMOTE_IP) — using .env.prod"
else
  # Prefer .env.local, fall back to .env
  if [ -f "$REPO_DIR/.env.local" ]; then
    ENV_FILE="$REPO_DIR/.env.local"
  else
    ENV_FILE="$REPO_DIR/.env"
  fi
  log "Running locally — using $(basename "$ENV_FILE")"
fi

if [ -f "$ENV_FILE" ]; then
  set -o allexport
  # shellcheck disable=SC1091
  source "$ENV_FILE"
  set +o allexport
else
  echo "[startup] ERROR: env file not found: $ENV_FILE"
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

# ── Clear old logs ─────────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
log "Clearing old logs …"
rm -f "$API_LOG" "$WEB_LOG" "$LOG_DIR/signal_ai.log" "$LOG_DIR/trades.log" "$LOG_DIR/error.log"

# ── Step 2: Pull latest code (remote only) ────────────────────────────────────
if $IS_REMOTE; then
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
else
  log "Skipping git pull (local mode) — using current working tree"
fi

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

# ── Step 3: Resolve deps / bootstrap ─────────────────────────────────────────
API_DIR="$REPO_DIR/apps/api"
VENV_DIR="$API_DIR/.venv"
WEB_DIR="$REPO_DIR/apps/web"

# ── Step 4: Bootstrap deps if missing; reinstall only when lock files change ──
NEED_BOOTSTRAP=false
[ ! -d "$VENV_DIR" ]              && NEED_BOOTSTRAP=true
[ ! -d "$REPO_DIR/node_modules" ] && NEED_BOOTSTRAP=true

API_REQ_MARKER="$REPO_DIR/.last_api_req_hash"
NPM_LOCK_MARKER="$REPO_DIR/.last_npm_lock_hash"

hash_file() {
  md5sum "$1" 2>/dev/null | awk '{print $1}' || md5 -q "$1" 2>/dev/null || echo ""
}

if $NEED_BOOTSTRAP; then
  log "Dependencies missing — running bootstrap.sh …"
  bash "$REPO_DIR/scripts/bootstrap.sh"
  hash_file "$API_DIR/requirements.txt" > "$API_REQ_MARKER"
  hash_file "$REPO_DIR/package-lock.json" > "$NPM_LOCK_MARKER"
  log "Bootstrap complete."
else
  # FastAPI Python deps: reinstall only when requirements.txt hash changes
  CURRENT_API_HASH=$(hash_file "$API_DIR/requirements.txt")
  STORED_API_HASH=$(cat "$API_REQ_MARKER" 2>/dev/null || echo "")
  if [ "$CURRENT_API_HASH" != "$STORED_API_HASH" ]; then
    log "requirements.txt changed — updating Python deps …"
    "$VENV_DIR/bin/pip" install -q --upgrade pip
    "$VENV_DIR/bin/pip" install -q -r "$API_DIR/requirements.txt"
    echo "$CURRENT_API_HASH" > "$API_REQ_MARKER"
    log "Python deps updated."
  else
    log "Python deps unchanged — skipping pip install."
  fi

  # npm deps: reinstall only when package-lock.json hash changes
  CURRENT_NPM_HASH=$(hash_file "$REPO_DIR/package-lock.json")
  STORED_NPM_HASH=$(cat "$NPM_LOCK_MARKER" 2>/dev/null || echo "")
  if [ "$CURRENT_NPM_HASH" != "$STORED_NPM_HASH" ]; then
    log "package-lock.json changed — running npm ci …"
    cd "$WEB_DIR" && "$NPM_CMD" ci --silent 2>&1 | tail -3 && cd "$REPO_DIR"
    echo "$CURRENT_NPM_HASH" > "$NPM_LOCK_MARKER"
    log "npm deps updated."
  else
    log "npm deps unchanged — skipping npm install."
  fi
fi

# ── Step 5: Build only when relevant code changed ────────────────────────────
BUILD_MARKER="$REPO_DIR/.last_web_build_sha"
ENV_HASH_MARKER="$REPO_DIR/.last_env_build_hash"

CURRENT_ENV_HASH=$(hash_file "$ENV_FILE")
STORED_ENV_HASH=$(cat "$ENV_HASH_MARKER" 2>/dev/null || echo "")
ENV_FILE_CHANGED=false
[ "$CURRENT_ENV_HASH" != "$STORED_ENV_HASH" ] && ENV_FILE_CHANGED=true

if $IS_REMOTE; then
  WEB_CODE_CHANGED=$(git diff HEAD@{1} HEAD --name-only 2>/dev/null | grep -c "^apps/web/" || true)
  if [ "$WEB_CODE_CHANGED" -gt 0 ] || $ENV_FILE_CHANGED || $NEED_BOOTSTRAP; then
    log "Rebuilding Next.js app (web changes: $WEB_CODE_CHANGED, env changed: $ENV_FILE_CHANGED) …"
    cd "$WEB_DIR" && "$NPM_CMD" run build 2>&1 | tail -5 && cd "$REPO_DIR"
    echo "$CURRENT_ENV_HASH" > "$ENV_HASH_MARKER"
    log "Web build complete."
  else
    log "Web code and env unchanged — skipping Next.js build."
  fi
else
  LAST_BUILD_SHA=$(cat "$BUILD_MARKER" 2>/dev/null || echo "")
  CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
  WEB_DIRTY=$(git status --porcelain apps/web/ 2>/dev/null | wc -l | tr -d ' ')

  if [ "$CURRENT_SHA" != "$LAST_BUILD_SHA" ] || [ "$WEB_DIRTY" -gt 0 ] || $ENV_FILE_CHANGED || $NEED_BOOTSTRAP; then
    log "Web source changes detected — rebuilding Next.js app …"
    cd "$WEB_DIR" && "$NPM_CMD" run build 2>&1 | tail -5 && cd "$REPO_DIR"
    echo "$CURRENT_SHA" > "$BUILD_MARKER"
    echo "$CURRENT_ENV_HASH" > "$ENV_HASH_MARKER"
    log "Web build complete."
  else
    log "Web source unchanged — skipping Next.js build (local mode)."
  fi
fi

# ── Step 6: Start API via npm run api:prod / api ──────────────────────────────
log "Starting API on port $API_PORT …"
cd "$REPO_DIR"
if $IS_REMOTE; then
  nohup "$NPM_CMD" run api:prod >> "$API_LOG" 2>&1 &
else
  nohup "$NPM_CMD" run api >> "$API_LOG" 2>&1 &
fi
API_PID=$!
echo "$API_PID" > "$PID_FILE"
log "API started (PID $API_PID)"

# ── Step 7: Start Web via npm run start / dev ─────────────────────────────────
log "Starting Web on port $WEB_PORT …"
cd "$REPO_DIR"
if $IS_REMOTE; then
  nohup "$NPM_CMD" run start >> "$WEB_LOG" 2>&1 &
else
  nohup "$NPM_CMD" run dev >> "$WEB_LOG" 2>&1 &
fi
WEB_PID=$!
echo "$WEB_PID" >> "$PID_FILE"
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
printf "║  Mode: %-50s║\n" "$( $IS_REMOTE && echo "remote ($REMOTE_IP)" || echo "local" )"
printf "║  Env:  %-50s║\n" "$(basename "$ENV_FILE")"
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
