/**
 * Plivo <-> swaram voice bridge (inbound phone calls).
 *
 * A caller dials the Plivo number; Plivo answers with our XML (see routes/plivo.ts)
 * which opens a bidirectional media stream to `wss://<host>/api/plivo/stream`. This
 * module owns that WebSocket: for each call it opens a *second* WebSocket to swaram
 * and pumps audio both ways, transcoding μ-law-8k <-> PCM16-24k (see plivoAudio.ts).
 *
 * The line runs the Subash Care product-registration agent (see plivoAgent.ts) — the
 * same persona, tools and validation as the browser UI, sharing one registration store.
 * Barge-in: when swaram detects caller speech it cancels its own reply, and we flush
 * Plivo's play buffer with `clearAudio` so the caller stops hearing the old one.
 */

import type { Server } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { mulaw8kToPcm24k, Pcm24kToMulaw8k } from "./plivoAudio.js";
import { subashAgent, type CallState } from "./plivoAgent.js";

const STREAM_PATH = "/api/plivo/stream";
const MODEL = process.env.SWARAM_MODEL ?? "mal-realtime-simple";
const VOICE = process.env.PLIVO_VOICE ?? "mal-female";
// https://api.swaram.live -> wss://api.swaram.live
const SWARAM_WS = `${config.swaram.baseUrl.replace(/^http/, "ws")}/v1/realtime`;

// The agent this line answers as. (Stage 1 was a bare greeter; the phone now runs
// the Subash Care product-registration agent — same persona/tools as the browser page.)
const AGENT = subashAgent;

/** Mint a short-lived swaram client token (same call the browser token route makes). */
async function mintSwaramToken(): Promise<string> {
  const upstream = await fetch(`${config.swaram.baseUrl}/v1/realtime/client_secrets`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.swaram.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ session: { model: MODEL } }),
  });
  const raw: any = await upstream.json().catch(() => ({}));
  if (!upstream.ok) throw new Error(`swaram token ${upstream.status}: ${JSON.stringify(raw)}`);
  const token =
    raw?.value ??
    raw?.token ??
    raw?.client_secret?.value ??
    (typeof raw?.client_secret === "string" ? raw.client_secret : undefined);
  if (!token) throw new Error("swaram token: no token field in response");
  return token as string;
}

/** Attach the /api/plivo/stream WebSocket server onto the existing HTTP server. */
export function attachPlivoBridge(server: Server): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      /* keep default */
    }
    if (pathname === STREAM_PATH) {
      wss.handleUpgrade(req, socket, head, (ws) => handleCall(ws));
    } else {
      socket.destroy();
    }
  });

  console.log(`[plivo] media bridge listening at ${STREAM_PATH}`);
}

/** One phone call = one Plivo WS + one swaram WS. */
function handleCall(plivo: WebSocket): void {
  let streamId = "";
  let swaram: WebSocket | null = null;
  let swaramReady = false;
  let mediaIn = 0; // caller frames received
  let firstAudioOut = false;
  let agentTranscript = ""; // accumulates the agent's spoken text for the current turn
  const state: CallState = {}; // per-call registration draft id, threaded through tools
  const down = new Pcm24kToMulaw8k();
  const pending: string[] = []; // caller audio buffered until swaram is ready
  const MAX_PENDING = 250; // ~5s of 8k frames — cap so a slow connect can't grow unbounded

  const toPlivo = (obj: unknown) => {
    if (plivo.readyState === WebSocket.OPEN) plivo.send(JSON.stringify(obj));
  };
  const toSwaram = (obj: unknown) => {
    if (swaram && swaram.readyState === WebSocket.OPEN) swaram.send(JSON.stringify(obj));
  };

  async function openSwaram(): Promise<void> {
    let token: string;
    try {
      token = await mintSwaramToken();
    } catch (e: any) {
      console.error("[plivo] could not mint swaram token:", e?.message ?? e);
      try { plivo.close(); } catch { /* ignore */ }
      return;
    }
    const url = `${SWARAM_WS}?model=${encodeURIComponent(MODEL)}`;
    const s = new WebSocket(url, ["realtime", "openai-insecure-api-key." + token]);
    swaram = s;

    s.on("open", () => {
      console.log("[plivo] swaram connected");
      toSwaram({
        type: "session.update",
        session: {
          instructions: AGENT.instructions(AGENT.agentName(VOICE)),
          voice: VOICE,
          tools: AGENT.tools(),
          tool_choice: "auto", // "required" loops — confirmed against the live API
        },
      });
    });

    s.on("message", (data) => {
      let m: any;
      try {
        m = JSON.parse(data.toString());
      } catch {
        return;
      }
      switch (m.type) {
        case "session.updated":
          swaramReady = true;
          toSwaram({ type: "response.create" }); // greet first
          for (const a of pending) toSwaram({ type: "input_audio_buffer.append", audio: a });
          pending.length = 0;
          break;
        case "response.output_audio.delta":
          if (m.delta) {
            if (!firstAudioOut) { firstAudioOut = true; console.log("[plivo] first audio -> caller"); }
            const mu = down.push(m.delta);
            if (mu) toPlivo({ event: "playAudio", media: { contentType: "audio/x-mulaw", sampleRate: 8000, payload: mu } });
          }
          break;
        case "input_audio_buffer.speech_started":
          // Caller barged in — swaram cancels its own reply; flush what Plivo has queued.
          down.reset();
          if (streamId) toPlivo({ event: "clearAudio", streamId });
          break;
        case "response.function_call_arguments.done": {
          let args: any = {};
          try {
            args = JSON.parse(m.arguments ?? "{}");
          } catch {
            /* leave as {} */
          }
          const out = AGENT.handleFunction(m.name, args, state);
          console.log(`[plivo] tool ${m.name} ->`, JSON.stringify(out).slice(0, 200));
          toSwaram({
            type: "conversation.item.create",
            item: { type: "function_call_output", call_id: m.call_id, output: JSON.stringify(out) },
          });
          // swaram auto-continues the reply after a function_call_output.
          break;
        }
        case "conversation.item.input_audio_transcription.completed":
          if (m.transcript) console.log("[plivo] caller:", m.transcript);
          break;
        case "response.output_audio_transcript.delta":
          if (m.delta) agentTranscript += m.delta;
          break;
        case "response.done":
          if (agentTranscript.trim()) console.log("[plivo] agent :", agentTranscript.trim());
          agentTranscript = "";
          break;
        case "error":
          console.error("[plivo] swaram error:", m.error?.message ?? m.error);
          break;
      }
    });

    s.on("close", (code: number, reason: Buffer) => {
      console.log(`[plivo] swaram closed  code=${code} reason=${reason?.toString() || "(none)"}  mediaIn=${mediaIn} audioOut=${firstAudioOut}`);
      swaramReady = false;
      try { plivo.close(); } catch { /* ignore */ }
    });
    s.on("error", (e: any) => {
      console.error("[plivo] swaram ws error:", e?.message ?? e);
    });
  }

  plivo.on("message", (data) => {
    let m: any;
    try {
      m = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (m.event) {
      case "start":
        streamId = m.start?.streamId || m.streamId || "";
        console.log("[plivo] stream start:", streamId, "format:", JSON.stringify(m.start?.mediaFormat ?? {}));
        openSwaram();
        break;
      case "media": {
        const payload = m.media?.payload;
        if (!payload) break;
        const pcm24 = mulaw8kToPcm24k(payload);
        if (!pcm24) break;
        mediaIn++;
        if (swaramReady) toSwaram({ type: "input_audio_buffer.append", audio: pcm24 });
        else if (pending.length < MAX_PENDING) pending.push(pcm24);
        break;
      }
      case "stop":
        console.log("[plivo] stream stop");
        try { swaram?.close(); } catch { /* ignore */ }
        break;
      case "dtmf":
        // Not used by the greeter; would be handled per-agent later.
        break;
      default:
        break;
    }
  });

  plivo.on("close", (code: number, reason: Buffer) => {
    console.log(`[plivo] plivo ws closed  code=${code} reason=${reason?.toString() || "(none)"}  mediaIn=${mediaIn}`);
    try { swaram?.close(); } catch { /* ignore */ }
  });
  plivo.on("error", (e: any) => {
    console.error("[plivo] plivo ws error:", e?.message ?? e);
    try { swaram?.close(); } catch { /* ignore */ }
  });
}
