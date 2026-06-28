#!/usr/bin/env bash
# =============================================================================
# startup.sh — SignalAI startup script (works locally and on remote host)
# Usage: ./startup.sh [--force-frontend|--force-backend|--force-all]
# =============================================================================
set -euo pipefail

REMOTE_IP="209.182.232.165"
FORCE_FRONTEND=false
FORCE_BACKEND=false

show_usage() {
  cat << EOF
Usage: ./startup.sh [OPTIONS]

Options:
  --force-frontend, -ff   Force rebuild frontend (Next.js) only
  --force-backend, -fb    Force reinstall backend (Python) dependencies
  --force-all, -fa        Force rebuild both frontend and backend
  -h, --help              Show this help message

Examples:
  ./startup.sh                    # Normal startup (auto-detect changes)
  ./startup.sh --force-frontend   # Force rebuild Next.js only
  ./startup.sh --force-backend    # Force reinstall Python deps only
  ./startup.sh --force-all        # Force rebuild everything
EOF
  exit 0
}

# Parse arguments
for arg in "$@"; do
  case $arg in
    --force-frontend|-ff)
      FORCE_FRONTEND=true
      shift || true
      ;;
    --force-backend|-fb)
      FORCE_BACKEND=true
      shift || true
      ;;
    --force-all|-fa)
      FORCE_FRONTEND=true
      FORCE_BACKEND=true
      shift || true
      ;;
    -h|--help)
      show_usage
      ;;
    *)
      echo "Unknown option: $arg"
      show_usage
      ;;
  esac
done

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
      pid=$(echo "$pid" | tr -d '\r')
      if [ -n "$pid" ]; then
        if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32" ]]; then
          MSYS_NO_PATHCONV=1 taskkill.exe /F /PID "$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
        else
          if kill -0 "$pid" 2>/dev/null; then
            log "Stopping PID $pid …"
            kill "$pid" 2>/dev/null || true
          fi
        fi
      fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
}

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

kill_process_tree() {
  local pid="$1"
  local children
  # Get all child processes recursively
  children=$(pgrep -P "$pid" 2>/dev/null || true)

  # Recursively kill children first
  for child in $children; do
    kill_process_tree "$child"
  done

  # Then kill the parent
  if kill -0 "$pid" 2>/dev/null; then
    kill -TERM "$pid" 2>/dev/null || true
    sleep 0.2
    kill -9 "$pid" 2>/dev/null || true
  fi
}

kill_by_port() {
  local port="$1"
  local pids
  pids=$(get_pids_on_port "$port")
  if [ -n "$pids" ]; then
    log "Killing existing process on port $port and its children …"
    for pid in $pids; do
      if [[ "${OSTYPE:-}" == "msys" || "${OSTYPE:-}" == "cygwin" || "${OSTYPE:-}" == "win32" ]]; then
        MSYS_NO_PATHCONV=1 taskkill.exe /F /T /PID "$pid" >/dev/null 2>&1 || kill -9 "$pid" >/dev/null 2>&1 || true
      else
        kill_process_tree "$pid"
      fi
    done
    sleep 0.5
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
if $FORCE_FRONTEND || $FORCE_BACKEND; then
  log "Force rebuild requested: Frontend=$FORCE_FRONTEND, Backend=$FORCE_BACKEND"
fi
log "Stopping any running instances …"
kill_pid_file
kill_by_port "$API_PORT"
kill_by_port "$WEB_PORT"

# Extra cleanup: kill any lingering uvicorn/node processes
pkill -f "uvicorn.*main:app" 2>/dev/null || true
pkill -f "node.*next.*start" 2>/dev/null || true
sleep 1

# Verify ports are actually free
REMAINING_API=$(get_pids_on_port "$API_PORT")
REMAINING_WEB=$(get_pids_on_port "$WEB_PORT")
if [ -n "$REMAINING_API" ] || [ -n "$REMAINING_WEB" ]; then
  log "WARNING: Some processes still running. Force killing …"
  [ -n "$REMAINING_API" ] && kill -9 $REMAINING_API 2>/dev/null || true
  [ -n "$REMAINING_WEB" ] && kill -9 $REMAINING_WEB 2>/dev/null || true
  sleep 1
fi

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
API_DIR="$REPO_DIR/backend"
VENV_DIR="$API_DIR/.venv"
WEB_DIR="$REPO_DIR/front-end"

if [ -f "$VENV_DIR/Scripts/pip" ] || [ -f "$VENV_DIR/Scripts/pip.exe" ]; then
  PIP_CMD="$VENV_DIR/Scripts/pip"
  PYTHON_CMD="$VENV_DIR/Scripts/python"
else
  PIP_CMD="$VENV_DIR/bin/pip"
  PYTHON_CMD="$VENV_DIR/bin/python"
fi

# ── Step 4: Bootstrap deps if missing; reinstall only when lock files change ──
NEED_BOOTSTRAP=false
[ ! -d "$VENV_DIR" ]              && NEED_BOOTSTRAP=true
[ ! -d "$WEB_DIR/node_modules" ]  && NEED_BOOTSTRAP=true

API_REQ_MARKER="$REPO_DIR/.last_api_req_hash"
NPM_LOCK_MARKER="$REPO_DIR/.last_npm_lock_hash"

hash_file() {
  md5sum "$1" 2>/dev/null | awk '{print $1}' || md5 -q "$1" 2>/dev/null || echo ""
}

if $NEED_BOOTSTRAP; then
  log "Dependencies missing — running bootstrap.sh …"
  bash "$REPO_DIR/scripts/bootstrap.sh"
  hash_file "$API_DIR/requirements.txt" > "$API_REQ_MARKER"
  hash_file "$WEB_DIR/package-lock.json" > "$NPM_LOCK_MARKER"
  log "Bootstrap complete."
else
  # FastAPI Python deps: reinstall only when requirements.txt hash changes OR force backend
  CURRENT_API_HASH=$(hash_file "$API_DIR/requirements.txt")
  STORED_API_HASH=$(cat "$API_REQ_MARKER" 2>/dev/null || echo "")
  if [ "$CURRENT_API_HASH" != "$STORED_API_HASH" ] || $FORCE_BACKEND; then
    if $FORCE_BACKEND; then
      log "Force backend rebuild — reinstalling Python deps …"
      rm -rf "$VENV_DIR"
      python3 -m venv "$VENV_DIR"
      if [ -f "$VENV_DIR/Scripts/pip" ] || [ -f "$VENV_DIR/Scripts/pip.exe" ]; then
        PIP_CMD="$VENV_DIR/Scripts/pip"
        PYTHON_CMD="$VENV_DIR/Scripts/python"
      else
        PIP_CMD="$VENV_DIR/bin/pip"
        PYTHON_CMD="$VENV_DIR/bin/python"
      fi
    else
      log "requirements.txt changed — updating Python deps …"
    fi
    "$PYTHON_CMD" -m pip install -q --upgrade pip
    "$PIP_CMD" install -q -r "$API_DIR/requirements.txt"
    echo "$CURRENT_API_HASH" > "$API_REQ_MARKER"
    log "Python deps updated."
  else
    log "Python deps unchanged — skipping pip install."
  fi

  # npm deps: reinstall only when package-lock.json hash changes (not affected by force flags)
  CURRENT_NPM_HASH=$(hash_file "$WEB_DIR/package-lock.json")
  STORED_NPM_HASH=$(cat "$NPM_LOCK_MARKER" 2>/dev/null || echo "")
  if [ "$CURRENT_NPM_HASH" != "$STORED_NPM_HASH" ]; then
    log "package-lock.json changed — running npm install inside front-end …"
    cd "$WEB_DIR" && "$NPM_CMD" install --silent 2>&1 | tail -3 && cd "$REPO_DIR"
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
  # Compare current commit with last build marker
  LAST_BUILD_SHA=$(cat "$BUILD_MARKER" 2>/dev/null || echo "")
  CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
  WEB_CODE_CHANGED=0

  if [ -n "$LAST_BUILD_SHA" ] && [ "$LAST_BUILD_SHA" != "$CURRENT_SHA" ]; then
    # Check if front-end files changed between last build and current commit
    WEB_CODE_CHANGED=$(git diff --name-only "$LAST_BUILD_SHA" "$CURRENT_SHA" 2>/dev/null | grep -c "^front-end/" || true)
  elif [ -z "$LAST_BUILD_SHA" ]; then
    # No previous build marker, force rebuild
    WEB_CODE_CHANGED=1
  fi

  if [ "$WEB_CODE_CHANGED" -gt 0 ] || $ENV_FILE_CHANGED || $NEED_BOOTSTRAP || $FORCE_FRONTEND; then
    if $FORCE_FRONTEND; then
      log "Force frontend rebuild — clearing Next.js cache …"
      rm -rf "$WEB_DIR/.next" "$WEB_DIR/out"
    fi
    log "Rebuilding Next.js app (web changes: $WEB_CODE_CHANGED, env changed: $ENV_FILE_CHANGED, force: $FORCE_FRONTEND) …"
    cd "$WEB_DIR" && "$NPM_CMD" run build 2>&1 | tail -5 && cd "$REPO_DIR"
    echo "$CURRENT_SHA" > "$BUILD_MARKER"
    echo "$CURRENT_ENV_HASH" > "$ENV_HASH_MARKER"
    log "Web build complete."
  else
    log "Web code and env unchanged — skipping Next.js build."
  fi
else
  LAST_BUILD_SHA=$(cat "$BUILD_MARKER" 2>/dev/null || echo "")
  CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "")
  WEB_DIRTY=$(git status --porcelain front-end/ 2>/dev/null | wc -l | tr -d ' ')

  if [ "$CURRENT_SHA" != "$LAST_BUILD_SHA" ] || [ "$WEB_DIRTY" -gt 0 ] || $ENV_FILE_CHANGED || $NEED_BOOTSTRAP || $FORCE_FRONTEND; then
    if $FORCE_FRONTEND; then
      log "Force frontend rebuild — clearing Next.js cache …"
      rm -rf "$WEB_DIR/.next" "$WEB_DIR/out"
    fi
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
echo "║  Commands:                                               ║"
echo "║    Stop:              ./stop.sh                          ║"
echo "║    Force frontend:    ./startup.sh --force-frontend      ║"
echo "║    Force backend:     ./startup.sh --force-backend       ║"
echo "║    Force all:         ./startup.sh --force-all           ║"
echo "║    Help:              ./startup.sh --help                ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  Logs:                                                   ║"
echo "║    tail -f $API_LOG"
echo "║    tail -f $WEB_LOG"
echo "╚══════════════════════════════════════════════════════════╝"
