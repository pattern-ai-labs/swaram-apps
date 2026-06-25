import type { Voice } from "../types";

export interface SwaramHandlers {
  onStatus?: (status: "connecting" | "ready" | "closed") => void;
  onTutorTurnStart?: () => void;
  onTutorTranscriptDelta?: (delta: string) => void;
  onTutorTurnEnd?: () => void;
  onAudioDelta?: (base64: string) => void;
  onLearnerSpeechStart?: () => void;
  onLearnerSpeechStop?: () => void;
  /** swaram's transcript of what the learner said (one event per turn). */
  onLearnerTranscript?: (transcript: string) => void;
  /** The model wants to call one of your tools. args is the parsed object. */
  onFunctionCall?: (name: string, callId: string, args: any) => void;
  onError?: (message: string) => void;
}

export interface VoiceTool {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

const WS_BASE = "wss://api.swaram.live/v1/realtime";

/**
 * Thin wrapper over the swaram realtime WebSocket. Voice in (PCM16 base64),
 * voice + tutor-transcript out. (swaram does not transcribe learner audio
 * and does not accept text turns — confirmed against the live API.)
 */
export class SwaramSession {
  private ws: WebSocket | null = null;

  constructor(private handlers: SwaramHandlers) {}

  connect(opts: {
    token: string;
    model: string;
    instructions: string;
    voice: Voice;
    tools?: VoiceTool[];
  }): void {
    this.handlers.onStatus?.("connecting");
    const url = `${WS_BASE}?model=${encodeURIComponent(opts.model)}`;
    const ws = new WebSocket(url, [
      "realtime",
      "openai-insecure-api-key." + opts.token,
    ]);
    this.ws = ws;

    ws.onopen = () => {
      const session: Record<string, unknown> = {
        instructions: opts.instructions,
        voice: opts.voice,
      };
      if (opts.tools && opts.tools.length) {
        session.tools = opts.tools;
        session.tool_choice = "auto"; // "required" loops — confirmed against the live API
      }
      this.send({ type: "session.update", session });
    };

    ws.onmessage = (ev) => {
      let m: any;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      switch (m.type) {
        case "session.updated":
          this.handlers.onStatus?.("ready");
          break;
        case "input_audio_buffer.speech_started":
          this.handlers.onLearnerSpeechStart?.();
          break;
        case "input_audio_buffer.speech_stopped":
          this.handlers.onLearnerSpeechStop?.();
          break;
        case "conversation.item.input_audio_transcription.completed":
          this.handlers.onLearnerTranscript?.(m.transcript ?? "");
          break;
        case "response.created":
          this.handlers.onTutorTurnStart?.();
          break;
        case "response.output_audio.delta":
          if (m.delta) this.handlers.onAudioDelta?.(m.delta);
          break;
        case "response.output_audio_transcript.delta":
          if (m.delta) this.handlers.onTutorTranscriptDelta?.(m.delta);
          break;
        case "response.function_call_arguments.done": {
          let args: any = {};
          try {
            args = JSON.parse(m.arguments ?? "{}");
          } catch {
            /* leave as {} */
          }
          this.handlers.onFunctionCall?.(m.name, m.call_id, args);
          break;
        }
        case "response.done":
          this.handlers.onTutorTurnEnd?.();
          break;
        case "error":
          this.handlers.onError?.(
            m.error?.message || "An error occurred in the voice session."
          );
          break;
      }
    };

    ws.onerror = () => {
      this.handlers.onError?.("Voice connection error.");
    };
    ws.onclose = () => {
      this.handlers.onStatus?.("closed");
    };
  }

  /** Stream a base64 PCM16 @ 24 kHz chunk of the learner's mic. */
  sendAudio(base64: string): void {
    this.send({ type: "input_audio_buffer.append", audio: base64 });
  }

  /** Return a tool's result. swaram auto-continues the reply afterwards. */
  sendToolResult(callId: string, output: unknown): void {
    this.send({
      type: "conversation.item.create",
      item: {
        type: "function_call_output",
        call_id: callId,
        output: typeof output === "string" ? output : JSON.stringify(output),
      },
    });
  }

  /** Ask the model to produce a reply now (used to make it greet first). */
  requestResponse(): void {
    this.send({ type: "response.create" });
  }

  /** Explicitly stop the current reply (barge-in). */
  cancel(): void {
    this.send({ type: "response.cancel" });
  }

  private send(obj: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj));
    }
  }

  close(): void {
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }
}
