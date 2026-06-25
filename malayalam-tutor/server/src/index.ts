import express from "express";
import cors from "cors";
import { config, warnMissingConfig } from "./config.js";
import { ingestRouter } from "./routes/ingest.js";
import { lessonsRouter } from "./routes/lessons.js";
import { swaramTokenRouter } from "./routes/swaramToken.js";
import { logRouter } from "./routes/log.js";
import { loadLessons } from "./lessons.js";

const app = express();

app.use(cors({ origin: config.corsOrigins }));
app.use(express.json({ limit: "2mb" })); // JSON bodies (pasted-text ingest)

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    bedrock: Boolean(config.bedrockBearerToken),
    swaram: Boolean(config.swaram.apiKey),
    region: config.awsRegion,
    model: config.bedrockModelId,
  });
});

app.use("/api/ingest", ingestRouter); // upload → Bedrock (background) → lesson
app.use("/api/lessons", lessonsRouter); // saved-lesson library
app.use("/api/swaram-token", swaramTokenRouter); // mints the short-lived browser token
app.use("/api", logRouter); // POST /api/log, GET /api/logs

loadLessons();
warnMissingConfig();
app.listen(config.port, () => {
  console.log(`[server] listening on http://localhost:${config.port}`);
});
