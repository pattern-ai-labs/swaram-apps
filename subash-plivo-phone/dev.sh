#!/usr/bin/env bash
# DEV mode (for editing the browser UI): runs the Express API (8090) with hot-reload and
# the Vite client (5173) with HMR; Vite proxies /api/* to the server.
#
# NOTE: the Plivo phone bridge lives on the SERVER (:8090). For real phone calls, use
# ./start.sh (single server) and point your tunnel at :8090 — not at Vite. See the README.
set -e
cd "$(dirname "$0")"
(cd server && npm run dev) &
SRV=$!
(cd client && npm run dev) &
VITE=$!
trap "kill $SRV $VITE 2>/dev/null" EXIT
echo "API  -> http://localhost:8090   (also the phone bridge)"
echo "App  -> http://localhost:5173   (open this to edit the UI)"
wait
