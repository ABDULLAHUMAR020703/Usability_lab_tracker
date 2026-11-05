#!/usr/bin/env bash
# Consumer Insights Hub - one-command launcher (macOS / Linux)
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js 22.13+ is required (https://nodejs.org)"; exit 1; }
[ -d backend/node_modules ] || { echo "Installing dependencies..."; npm run setup || exit 1; }
[ -f frontend/dist/index.html ] || { echo "Building interface..."; npm run build || exit 1; }
[ -f .env ] || cp .env.example .env
echo "Open http://localhost:4000"
npm start
