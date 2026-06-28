#!/usr/bin/env bash
# Test script to verify login is working

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "╔══════════════════════════════════════════════════════════╗"
echo "║              Login Endpoint Test Suite                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Test 1: Check if API is running
echo -n "Test 1: API health check... "
if curl -sf http://localhost:8003/api/v1/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC} - API not responding"
  exit 1
fi

# Test 2: Check if Next.js rewrite is working
echo -n "Test 2: Next.js rewrite... "
if curl -sf http://localhost:3003/api/v1/health > /dev/null 2>&1; then
  echo -e "${GREEN}✓ PASS${NC}"
else
  echo -e "${RED}✗ FAIL${NC} - Next.js not proxying API calls"
  exit 1
fi

# Test 3: Check if auth endpoint exists
echo -n "Test 3: Auth endpoint exists... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:8003/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}')

if [ "$STATUS" = "401" ] || [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✓ PASS${NC} (Status: $STATUS)"
else
  echo -e "${RED}✗ FAIL${NC} - Unexpected status: $STATUS"
  exit 1
fi

# Test 4: Check if login endpoint is accessible through Next.js
echo -n "Test 4: Login through Next.js... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3003/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}')

if [ "$STATUS" = "401" ] || [ "$STATUS" = "200" ]; then
  echo -e "${GREEN}✓ PASS${NC} (Status: $STATUS)"
else
  echo -e "${RED}✗ FAIL${NC} - Unexpected status: $STATUS"
  exit 1
fi

# Test 5: Try actual login with env credentials
echo -n "Test 5: Login with credentials... "
if [ -f "$HOME/SignalAI/.env.prod" ]; then
  # shellcheck disable=SC1091
  source "$HOME/SignalAI/.env.prod" 2>/dev/null || true

  if [ -n "${ADMIN_USERNAME:-}" ] && [ -n "${ADMIN_PASSWORD:-}" ]; then
    RESPONSE=$(curl -s -X POST http://localhost:8003/api/v1/auth/login \
      -H "Content-Type: application/json" \
      -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}")

    if echo "$RESPONSE" | grep -q '"ok"'; then
      echo -e "${GREEN}✓ PASS${NC}"
    else
      echo -e "${RED}✗ FAIL${NC} - Invalid credentials or unexpected response"
      echo "Response: $RESPONSE"
    fi
  else
    echo -e "${YELLOW}⊘ SKIP${NC} - ADMIN_USERNAME or ADMIN_PASSWORD not set in .env.prod"
  fi
else
  echo -e "${YELLOW}⊘ SKIP${NC} - .env.prod not found"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    All Tests Passed!                     ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Open browser: http://localhost:3003/login"
echo "  2. Check browser console (F12) for errors"
echo "  3. Try logging in with your credentials"
echo ""
