#!/usr/bin/env bash
# Runs the Express API (8090) and the Vite client (5173) together.
set -e
cd "$(dirname "$0")"
(cd server && npm run dev) &
SRV=$!
(cd client && npm run dev) &
VITE=$!
trap "kill $SRV $VITE 2>/dev/null" EXIT
echo "API  -> http://localhost:8090"
echo "App  -> http://localhost:5173   (open this)"
wait
