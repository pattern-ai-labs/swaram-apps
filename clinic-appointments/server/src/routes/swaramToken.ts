import { Router } from "express";
import { config } from "../config.js";

export const swaramTokenRouter = Router();

/**
 * POST /api/swaram-token
 * Mints a short-lived ephemeral client token (swaram_ek_...) so the browser
 * can open the realtime WebSocket without ever seeing the secret key.
 *
 * The browser passes the returned token as a WebSocket subprotocol:
 *   ["realtime", "openai-insecure-api-key." + token]
 *
 * NOTE: the exact request/response shape of /v1/realtime/client_secrets is
 * confirmed against the live swaram API once the key is available; we
 * normalise a few likely token field names below and also return the raw
 * payload so the client can adapt if needed.
 */
swaramTokenRouter.post("/", async (req, res) => {
  if (!config.swaram.apiKey) {
    return res.status(503).json({
      error: "swaram is not configured yet (SWARAM_API_KEY missing).",
    });
  }
  try {
    const upstream = await fetch(
      `${config.swaram.baseUrl}/v1/realtime/client_secrets`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.swaram.apiKey}`,
          "Content-Type": "application/json",
        },
        // forward an optional session config if the client sent one
        body: JSON.stringify(req.body ?? {}),
      }
    );

    const raw = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res
        .status(upstream.status)
        .json({ error: "swaram token request failed", raw });
    }

    const token =
      raw?.value ??
      raw?.token ??
      raw?.client_secret?.value ??
      (typeof raw?.client_secret === "string" ? raw.client_secret : undefined);

    return res.json({ token, raw });
  } catch (err: any) {
    console.error("[swaram-token] error:", err?.message ?? err);
    return res.status(502).json({ error: "Could not reach swaram." });
  }
});
