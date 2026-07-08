import { Router } from "express";
import express from "express";

/**
 * Plivo telephony webhooks (inbound).
 *
 *   POST/GET /api/plivo/answer  -> PlivoXML that opens a bidirectional media stream
 *                                  to /api/plivo/stream (handled by plivoBridge.ts).
 *   POST     /api/plivo/status  -> stream lifecycle callbacks (logged).
 *
 * The audio media itself does NOT come here — it's a WebSocket upgrade handled in
 * plivoBridge.ts. This router only returns the XML and logs callbacks.
 */
export const plivoRouter = Router();

// Plivo posts application/x-www-form-urlencoded call params.
plivoRouter.use(express.urlencoded({ extended: false }));

function answerXml(host: string): string {
  const wss = `wss://${host}/api/plivo/stream`;
  // bidirectional stream, μ-law 8k both ways, caller leg only (we generate the agent voice).
  // keepCallAlive keeps the call up for the whole conversation.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true"
          keepCallAlive="true"
          contentType="audio/x-mulaw;rate=8000"
          audioTrack="inbound"
          statusCallbackUrl="https://${host}/api/plivo/status">${wss}</Stream>
</Response>`;
}

function handleAnswer(req: express.Request, res: express.Response) {
  // The public host Plivo reaches us on — set PLIVO_PUBLIC_HOST when behind a tunnel/proxy.
  const host = process.env.PLIVO_PUBLIC_HOST || req.get("host") || "localhost";
  const b: any = req.body ?? {};
  console.log(`[plivo] answer  From=${b.From ?? "?"} To=${b.To ?? "?"} CallUUID=${b.CallUUID ?? "?"} -> wss://${host}/api/plivo/stream`);
  res.type("text/xml").send(answerXml(host));
}

plivoRouter.post("/answer", handleAnswer);
plivoRouter.get("/answer", handleAnswer);

plivoRouter.post("/status", (req, res) => {
  const b: any = req.body ?? {};
  console.log(`[plivo] status  ${b.StreamEvent ?? JSON.stringify(b)}`);
  res.sendStatus(200);
});

// Simple reachability probe (through the tunnel) — confirms the route is live.
plivoRouter.get("/health", (_req, res) => {
  res.json({ ok: true, stream: "/api/plivo/stream" });
});
