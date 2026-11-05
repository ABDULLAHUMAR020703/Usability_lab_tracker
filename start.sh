#!/usr/bin/env bash
# Consumer Insights Hub - one-command launcher (macOS / Linux)
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js 22.13+ is required (https://nodejs.org)"; exit 1; }
# Reinstall + rebuild on first run or when the code changed since the last build (e.g. after "git pull")
HEADREV=""
[ -d .git ] && command -v git >/dev/null && HEADREV=$(git rev-parse HEAD 2>/dev/null)
STAMP=$(cat .build-stamp 2>/dev/null)
if [ ! -d backend/node_modules ] || [ ! -f frontend/dist/index.html ] || { [ -n "$HEADREV" ] && [ "$HEADREV" != "$STAMP" ]; }; then
  echo "Installing dependencies and building the interface..."
  npm run setup && npm run build || exit 1
  [ -n "$HEADREV" ] && echo "$HEADREV" > .build-stamp
fi
[ -f .env ] || cp .env.example .env
echo "Open http://localhost:4000"
npm start
