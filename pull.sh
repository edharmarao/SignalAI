#!/usr/bin/env bash
# =============================================================================
# pull.sh — Pull latest code on the remote host
# Usage: ./pull.sh
# =============================================================================
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$REPO_DIR"

log() { echo "[$(date '+%m-%d %H:%M:%S')] $*"; }

log "Pulling latest code …"
git fetch origin main
git reset --hard origin/main
log "✅ Done — $(git log --oneline -1)"
