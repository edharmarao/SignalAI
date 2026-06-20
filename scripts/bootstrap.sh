#!/usr/bin/env bash
# =============================================================================
# bootstrap.sh — one-shot setup after cloning SignalAI
#
# Usage:
#   bash scripts/bootstrap.sh          # interactive (default)
#   bash scripts/bootstrap.sh --ci     # non-interactive (skip prompts)
#
# What it does:
#   1. Git identity + remote URL with GITHUB_TOKEN
#   2. Validates / creates .env (copies .env.prod as base if missing)
#   3. npm install  (JS deps + workspaces)
#   4. Python venv + pip install for apps/api
#   5. Prints a ready-to-run summary
# =============================================================================

set -e

CYAN="\033[96m"; GREEN="\033[92m"; YELLOW="\033[93m"; RED="\033[91m"; BOLD="\033[1m"; RESET="\033[0m"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CI=false
[[ "${1:-}" == "--ci" ]] && CI=true

log()  { echo -e "${CYAN}[bootstrap]${RESET} $*"; }
ok()   { echo -e "  ${GREEN}✓${RESET}  $*"; }
warn() { echo -e "  ${YELLOW}⚠${RESET}  $*"; }
err()  { echo -e "  ${RED}✗${RESET}  $*"; }

echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${CYAN}  SignalAI — Bootstrap Setup${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""

# ── 1. Git identity ─────────────────────────────────────────────────────────
log "Configuring git identity..."
git config user.email "edharmarao@gmail.com"
git config user.name  "edharmarao"
ok "git user  → edharmarao <edharmarao@gmail.com>"

# ── 2. Env file ──────────────────────────────────────────────────────────────
log "Checking env files..."

if [ ! -f "$ROOT/.env" ]; then
  if [ -f "$ROOT/.env.prod" ]; then
    warn ".env not found — copying .env.prod as base"
    cp "$ROOT/.env.prod" "$ROOT/.env"
    ok ".env created from .env.prod"
  else
    err ".env and .env.prod both missing — please create .env manually"
    exit 1
  fi
else
  ok ".env found"
fi

[ -f "$ROOT/.env.prod" ] && ok ".env.prod found" || warn ".env.prod not found (only needed on remote host)"

# Read GITHUB_TOKEN from .env
GITHUB_TOKEN=""
GITHUB_TOKEN=$(grep -E '^\s*GITHUB_TOKEN\s*=' "$ROOT/.env" 2>/dev/null | head -1 | sed 's/.*=\s*//' | tr -d '"'"'" || true)

# ── 3. Git remote ────────────────────────────────────────────────────────────
log "Configuring git remote..."
if [ -n "$GITHUB_TOKEN" ]; then
  git remote set-url origin "https://edharmarao:${GITHUB_TOKEN}@github.com/edharmarao/SignalAI.git" 2>/dev/null || \
  git remote add origin "https://edharmarao:${GITHUB_TOKEN}@github.com/edharmarao/SignalAI.git"
  ok "remote origin → https://edharmarao@github.com/edharmarao/SignalAI.git (token set)"
else
  warn "GITHUB_TOKEN not in .env — git push will require manual auth"
fi

# ── 4. Node / npm deps ────────────────────────────────────────────────────────
log "Installing JS dependencies (npm install)..."
npm install --silent
ok "npm workspaces installed (web + packages)"

# ── 5. Python venv ────────────────────────────────────────────────────────────
log "Setting up Python virtual environment for apps/api..."
cd "$ROOT/apps/api"

PYTHON_BIN=""
for bin in python3.14t python3.14 python3 python; do
  if command -v "$bin" &>/dev/null; then
    PYTHON_BIN="$bin"
    break
  fi
done

if [ -z "$PYTHON_BIN" ]; then
  err "Python not found. Install Python 3.14t from https://python.org"
  exit 1
fi

PYTHON_VERSION=$("$PYTHON_BIN" --version 2>&1)
ok "Python → $PYTHON_VERSION ($PYTHON_BIN)"

if [ ! -d ".venv" ]; then
  log "Creating venv..."
  "$PYTHON_BIN" -m venv .venv
  ok "venv created at apps/api/.venv"
else
  ok "venv already exists at apps/api/.venv"
fi

log "Installing Python dependencies (pip install -r requirements.txt)..."
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
ok "Python dependencies installed"

cd "$ROOT"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "${BOLD}${GREEN}  ✓ Bootstrap complete! You're ready to go.${RESET}"
echo -e "${BOLD}${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Start API:${RESET}  npm run api"
echo -e "  ${BOLD}Start Web:${RESET}  npm run dev"
echo -e "  ${BOLD}Both:${RESET}       open two terminals and run the above"
echo ""
echo -e "  API  →  ${CYAN}http://localhost:8003${RESET}       (docs: /docs)"
echo -e "  Web  →  ${CYAN}http://localhost:3003${RESET}"
echo ""
