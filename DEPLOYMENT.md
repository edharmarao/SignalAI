# Deployment Guide

## Quick Start

### Normal Deployment (Auto-detect)
```bash
./startup.sh
```
Automatically detects and rebuilds only what changed.

### Force Rebuild Options

When changes aren't reflecting or you need a clean build:

```bash
# Frontend only (FAST ~30s) - Use this for UI changes
./startup.sh --force-frontend
# or shorthand:
./startup.sh -ff

# Backend only (~2min) - Use for Python dependency issues
./startup.sh --force-backend
# or shorthand:
./startup.sh -fb

# Both frontend and backend (~2.5min) - Nuclear option
./startup.sh --force-all
# or shorthand:
./startup.sh -fa
```

### When to Use Each Option

| Scenario | Command | Time |
|----------|---------|------|
| Normal deployment | `./startup.sh` | ~5-15s |
| Frontend changes not showing | `./startup.sh -ff` | ~30s |
| Python import errors | `./startup.sh -fb` | ~2min |
| Everything broken | `./startup.sh -fa` | ~2.5min |

## VPS Deployment Workflow

### 1. Push Code to GitHub
```bash
# On local machine
git add -A
git commit -m "Your changes"
git push origin main
```

### 2. Deploy on VPS
```bash
# SSH to VPS
ssh edr@209.182.232.165

# Navigate to project
cd ~/SignalAI

# Stop running services
./stop.sh

# Deploy (auto-detect changes)
./startup.sh

# Or force frontend rebuild if needed
./startup.sh --force-frontend
```

### 3. Verify Deployment
```bash
# Check services are running
curl http://localhost:8003/api/v1/health
curl http://localhost:3003

# Check logs if issues
tail -f logs/api.log
tail -f logs/web.log

# Check git status
git log --oneline -1
```

## Troubleshooting

### Changes Not Reflecting

**Frontend changes not showing:**
```bash
./stop.sh
./startup.sh --force-frontend
```

**Backend changes not working:**
```bash
./stop.sh
./startup.sh --force-backend
```

**Both not working (nuclear option):**
```bash
./stop.sh

# Clear all caches
rm -f .last_* .pids
rm -rf front-end/.next front-end/out

# Force rebuild all
./startup.sh --force-all
```

### Port Already in Use

The startup script should handle this automatically, but if processes are stuck:

```bash
# Kill specific ports manually
lsof -ti tcp:8003 | xargs kill -9
lsof -ti tcp:3003 | xargs kill -9

# Or kill by process name
pkill -9 -f "uvicorn"
pkill -9 -f "node.*next"

# Then start
./startup.sh
```

### Build Markers Out of Sync

If builds are being skipped incorrectly:

```bash
# Clear build markers
rm -f .last_web_build_sha .last_env_build_hash .last_api_req_hash .last_npm_lock_hash

# Next startup will rebuild everything
./startup.sh
```

## Architecture

### Build Detection Logic

**Frontend:**
- Compares current git SHA with `.last_web_build_sha`
- Checks if `front-end/` files changed between SHAs
- Checks if `.env` file hash changed
- Rebuilds Next.js if any changes detected

**Backend:**
- Compares `requirements.txt` hash with `.last_api_req_hash`
- Reinstalls Python packages only if hash changed
- No rebuild needed for Python code changes (auto-reload in dev)

**NPM Dependencies:**
- Compares `package-lock.json` hash with `.last_npm_lock_hash`
- Runs `npm install` only if hash changed

### Force Rebuild Actions

**--force-frontend:**
- Deletes `.next/` and `out/` directories
- Runs `npm run build` (production) or `npm run dev` (local)
- Updates build markers

**--force-backend:**
- Deletes and recreates Python virtual environment
- Reinstalls all Python packages from scratch
- Updates requirements marker

**--force-all:**
- Performs both frontend and backend force rebuilds

## Environment Variables

The script automatically selects the correct env file:

- **Remote (VPS):** Uses `.env.prod`
- **Local:** Uses `.env.local` if exists, otherwise `.env`

## Logs

### View Logs
```bash
# API logs
tail -f ~/SignalAI/logs/api.log

# Web logs
tail -f ~/SignalAI/logs/web.log

# Last 100 lines
tail -100 ~/SignalAI/logs/api.log
```

### Log Files
- `logs/api.log` - FastAPI backend logs
- `logs/web.log` - Next.js frontend logs
- `.pids` - Process IDs of running services

## Service Management

### Start
```bash
./startup.sh [OPTIONS]
```

### Stop
```bash
./stop.sh
```

### Restart
```bash
./stop.sh && ./startup.sh
```

### Status Check
```bash
# Check if services are running
ps aux | grep -E "uvicorn|node.*next"

# Check ports
lsof -i :8003  # API
lsof -i :3003  # Web

# Check health endpoints
curl http://localhost:8003/api/v1/health
curl http://localhost:3003
```

## Performance Tips

1. **Frontend-only changes**: Always use `--force-frontend` instead of `--force-all` to save ~2 minutes
2. **Clear cache periodically**: Old `.next` cache can cause issues, clear with `rm -rf front-end/.next`
3. **Monitor logs**: Use `tail -f logs/*.log` to catch errors early
4. **Check git status**: Verify you're on the right commit with `git log --oneline -1`

## Quick Reference

```bash
# Help
./startup.sh --help

# Normal startup (auto-detect)
./startup.sh

# Force rebuilds
./startup.sh -ff    # Frontend only (FAST)
./startup.sh -fb    # Backend only
./startup.sh -fa    # Both (SLOW)

# Stop services
./stop.sh

# Check status
ps aux | grep -E "uvicorn|node"
curl http://localhost:8003/api/v1/health

# View logs
tail -f logs/api.log
tail -f logs/web.log

# Kill stuck processes
pkill -9 -f "uvicorn"
pkill -9 -f "node.*next"
```
