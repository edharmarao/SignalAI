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

CHANGED=$(git diff --name-only HEAD origin/main)

git reset --hard origin/main

if [ -n "$CHANGED" ]; then
  log "Files updated:"
  echo "$CHANGED" | while read -r f; do
    ts=$(git log -1 --format="%cd" --date=format:"%m-%d %H:%M" -- "$f" 2>/dev/null || echo "?")
    printf "    %-50s %s\n" "$f" "$ts"
  done
else
  log "Already up to date."
fi
log "✅ Done — $(git log --oneline -1)"
