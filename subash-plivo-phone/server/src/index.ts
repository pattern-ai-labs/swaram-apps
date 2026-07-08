import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { config, warnMissingConfig } from "./config.js";
import { swaramTokenRouter } from "./routes/swaramToken.js";
import { subashRouter } from "./routes/subash.js";
import { plivoRouter } from "./routes/plivo.js";
import { attachPlivoBridge } from "./plivoBridge.js";
import { logRouter } from "./routes/log.js";
import { loadRegistrations } from "./subash.js";

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, swaram: Boolean(config.swaram.apiKey) });
});

app.use("/api/swaram-token", swaramTokenRouter); // mints the short-lived browser token (browser UI)
app.use("/api/subash", subashRouter); // config / registration / complete / registrations / export
app.use("/api/plivo", plivoRouter); // phone: answer XML + stream-status callbacks
app.use("/api", logRouter); // POST /api/log, GET /api/logs

// Serve the built browser UI (client/dist) if present, so ONE server hosts BOTH the
// dashboard (where phone bookings show in the recent queue) and the Plivo phone
// bridge on a single port. In dev, run Vite instead (see dev.sh); for the phone /
// public deployment, build the client once (see start.sh) and point your tunnel here.
const clientDist = fileURLToPath(new URL("../../client/dist/", import.meta.url));
if (existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // SPA fallback: any non-/api GET serves index.html.
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(fileURLToPath(new URL("../../client/dist/index.html", import.meta.url)));
  });
  console.log("[server] serving built UI from client/dist");
} else {
  console.log("[server] client/dist not found — run `npm run build` in client (or use dev.sh for Vite)");
}

loadRegistrations();
warnMissingConfig();

const server = app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});

// Attach the Plivo <-> swaram media-stream WebSocket bridge onto the same HTTP server.
attachPlivoBridge(server);
