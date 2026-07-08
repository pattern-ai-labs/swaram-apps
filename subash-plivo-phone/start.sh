#!/usr/bin/env bash
# Phone / production mode: build the browser UI once, then run the SINGLE server that
# hosts BOTH the dashboard AND the Plivo phone bridge on one port (default 8090).
#
# Point your public tunnel/host at that ONE port, and set PLIVO_PUBLIC_HOST in
# server/.env to that public hostname (see the README, "Expose the server publicly").
set -e
cd "$(dirname "$0")"
(cd client && npm install && npm run build)   # -> client/dist (served by the server)
(cd server && npm install && npm start)       # -> http://localhost:8090  (UI + /api + phone bridge)
