import express from "express";
import cors from "cors";
import { config, warnMissingConfig } from "./config.js";
import { swaramTokenRouter } from "./routes/swaramToken.js";
import { clinicRouter } from "./routes/clinic.js";
import { logRouter } from "./routes/log.js";
import { loadBookings } from "./clinic.js";

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, swaram: Boolean(config.swaram.apiKey) });
});

app.use("/api/swaram-token", swaramTokenRouter); // mints the short-lived browser token
app.use("/api/clinic", clinicRouter); // config / availability / bookings / book
app.use("/api", logRouter); // POST /api/log, GET /api/logs

loadBookings();
warnMissingConfig();
app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});
