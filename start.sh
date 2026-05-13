#!/bin/bash
set -e

echo "🎧 Claudio FM — Starting..."

command -v node >/dev/null 2>&1 || { echo "Need Node.js >= 18"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "Need pnpm >= 9"; exit 1; }

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  pnpm install
fi

if [ ! -f "apps/server/.env" ]; then
  cp apps/server/.env.example apps/server/.env
  echo "Created apps/server/.env — please edit with your API keys"
fi

# Kill old processes on these ports
for PORT in 3000 8080 5173; do
  PID=$(lsof -ti:$PORT 2>/dev/null || netstat -ano 2>/dev/null | grep ":$PORT " | grep LISTENING | awk '{print $NF}' | head -1)
  [ -n "$PID" ] && kill "$PID" 2>/dev/null || true
done
sleep 1

echo "Starting NCM API on :3000..."
cd apps/server
npx NeteaseCloudMusicApi &
NCM_PID=$!
cd "$DIR"

echo "Starting Claudio backend (:8080) + frontend (:5173)..."
pnpm dev

# Cleanup
kill $NCM_PID 2>/dev/null || true
