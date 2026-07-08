import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, Voice } from "../types";
import { getSwaramToken } from "./api";
import { SwaramSession, type VoiceTool } from "./swaramClient";
import { MicCapture } from "../audio/micCapture";
import { PcmPlayer } from "../audio/player";

const MODEL = "mal-realtime-simple";

let _id = 0;
const nextId = () => `m${++_id}`;

export interface StartOpts {
  instructions: string;
  voice: Voice;
  tools?: VoiceTool[];
  /** Have the agent speak first (greet) instead of waiting for the user. */
  greet?: boolean;
  /** When set, the full conversation is logged to the server tagged with this name. */
  demo?: string;
  /** Called when the model invokes a tool. Do the work, then call reply(result). */
  onFunctionCall?: (
    name: string,
    args: any,
    reply: (output: unknown) => void
  ) => void;
}

/**
 * Encapsulates a swaram voice turn: mic → PCM16 → swaram → audio + transcripts,
 * with half-duplex gating, explicit interrupt, playback-drain speaking-state,
 * native transcripts (both sides), and optional function calling. Shared by the
 * tutor and the clinic demos.
 */
export function useVoiceSession() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("idle");
  const [agentSpeaking, setAgentSpeaking] = useState(false);
  const [learnerSpeaking, setLearnerSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(false);

  const sessionRef = useRef<SwaramSession | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const agentMsgRef = useRef<string | null>(null);
  const agentSpeakingRef = useRef(false);
  const micGateRef = useRef(false); // true while the agent speaks (half-duplex)
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const greetRef = useRef(false); // one-shot: make the agent speak first
  const sessionIdRef = useRef<string>("");
  const demoRef = useRef<string | null>(null);
  const agentTurnTextRef = useRef("");

  /** Fire-and-forget conversation logging (only when a demo name is set). */
  const logEvent = useCallback((type: string, data: Record<string, unknown>) => {
    if (!demoRef.current) return;
    fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        demo: demoRef.current,
        ts: new Date().toISOString(),
        type,
        ...data,
      }),
    }).catch(() => {});
  }, []);

  const clearDrainTimer = useCallback(() => {
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  }, []);

  const appendAgentDelta = useCallback((delta: string) => {
    agentTurnTextRef.current += delta;
    setMessages((prev) => {
      const id = agentMsgRef.current;
      if (id && prev.some((m) => m.id === id)) {
        return prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m));
      }
      const nid = nextId();
      agentMsgRef.current = nid;
      return [...prev, { id: nid, role: "tutor", text: delta, streaming: true }];
    });
  }, []);

  const addLearnerTranscript = useCallback(
    (t: string) => {
      const text = t.trim();
      if (!text) return;
      logEvent("user.said", { text });
      setMessages((prev) => [...prev, { id: nextId(), role: "learner", text }]);
    },
    [logEvent]
  );

  const start = useCallback(
    async (opts: StartOpts) => {
      setError(null);
      setMessages([]);
      micGateRef.current = false;
      greetRef.current = !!opts.greet;
      demoRef.current = opts.demo ?? null;
      sessionIdRef.current =
        (globalThis.crypto?.randomUUID?.() ?? String(Date.now()));
      agentTurnTextRef.current = "";
      clearDrainTimer();
      logEvent("session.start", { voice: opts.voice });
      try {
        const player = new PcmPlayer();
        await player.resume();
        playerRef.current = player;

        const { token } = await getSwaramToken({ session: { model: MODEL } });

        const session = new SwaramSession({
          onStatus: (s) => {
            setStatus(s);
            if (s === "ready" && greetRef.current) {
              greetRef.current = false;
              micGateRef.current = true; // hold the mic so the greeting isn't cut off
              sessionRef.current?.requestResponse();
            }
          },
          onTutorTurnStart: () => {
            clearDrainTimer();
            setAgentSpeaking(true);
            agentSpeakingRef.current = true;
            agentMsgRef.current = null;
            agentTurnTextRef.current = "";
            micGateRef.current = true; // hold mic so we never cancel the reply
          },
          onTutorTranscriptDelta: appendAgentDelta,
          onTutorTurnEnd: () => {
            const turn = agentTurnTextRef.current.trim();
            if (turn) logEvent("agent.said", { text: turn });
            agentTurnTextRef.current = "";
            setMessages((prev) =>
              prev.map((m) =>
                m.id === agentMsgRef.current ? { ...m, streaming: false } : m
              )
            );
            agentMsgRef.current = null;
            clearDrainTimer();
            // stay "speaking" until the queued audio actually drains
            const wait = (playerRef.current?.remainingMs() ?? 0) + 300;
            drainTimerRef.current = setTimeout(() => {
              setAgentSpeaking(false);
              agentSpeakingRef.current = false;
              micGateRef.current = false;
              drainTimerRef.current = null;
            }, wait);
          },
          onAudioDelta: (b64) => playerRef.current?.enqueue(b64),
          onLearnerSpeechStart: () => {
            setLearnerSpeaking(true);
            playerRef.current?.flush();
            setAgentSpeaking(false);
            agentSpeakingRef.current = false;
          },
          onLearnerSpeechStop: () => setLearnerSpeaking(false),
          onLearnerTranscript: addLearnerTranscript,
          onFunctionCall: (name, callId, args) => {
            logEvent("tool.call", { name, args });
            opts.onFunctionCall?.(name, args, (output) => {
              logEvent("tool.result", { name, output });
              if (name === "book_appointment" && (output as any)?.ok) {
                logEvent("booking.made", { booking: (output as any).booking });
              }
              sessionRef.current?.sendToolResult(callId, output);
            });
          },
          onError: (msg) => {
            micGateRef.current = false;
            logEvent("error", { message: msg });
            setError(msg);
          },
        });
        sessionRef.current = session;
        session.connect({
          token,
          model: MODEL,
          instructions: opts.instructions,
          voice: opts.voice,
          tools: opts.tools,
        });

        const mic = new MicCapture();
        micRef.current = mic;
        await mic.start((b64) => {
          if (micGateRef.current) return; // half-duplex
          sessionRef.current?.sendAudio(b64);
        });

        setMuted(false);
        setActive(true);
      } catch (e: any) {
        setError(e.message || "Could not start the session.");
      }
    },
    [appendAgentDelta, addLearnerTranscript, clearDrainTimer, logEvent]
  );

  const end = useCallback(async () => {
    logEvent("session.end", {});
    clearDrainTimer();
    await micRef.current?.stop();
    micRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    await playerRef.current?.close();
    playerRef.current = null;
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
    setLearnerSpeaking(false);
    setActive(false);
  }, [clearDrainTimer, logEvent]);

  useEffect(
    () => () => {
      if (drainTimerRef.current) clearTimeout(drainTimerRef.current);
      micRef.current?.stop();
      sessionRef.current?.close();
      playerRef.current?.close();
    },
    []
  );

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const nm = !m;
      micRef.current?.setMuted(nm);
      return nm;
    });
  }, []);

  const interrupt = useCallback(() => {
    if (!agentSpeakingRef.current) return;
    clearDrainTimer();
    playerRef.current?.flush();
    sessionRef.current?.cancel();
    micGateRef.current = false;
    setAgentSpeaking(false);
    agentSpeakingRef.current = false;
  }, [clearDrainTimer]);

  return {
    messages,
    status,
    agentSpeaking,
    learnerSpeaking,
    muted,
    error,
    active,
    start,
    end,
    interrupt,
    toggleMute,
  };
}
