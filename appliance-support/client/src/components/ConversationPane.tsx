import { useEffect, useRef } from "react";
import type { ChatMessage } from "../types";

function statusLabel(s: string): string {
  if (s === "ready") return "connected";
  if (s === "connecting") return "connecting…";
  if (s === "closed") return "disconnected";
  return s;
}

export default function ConversationPane({
  messages,
  status,
  tutorSpeaking,
  learnerSpeaking,
  muted,
  onToggleMute,
  onInterrupt,
  onEnd,
}: {
  messages: ChatMessage[];
  status: string;
  tutorSpeaking: boolean;
  learnerSpeaking: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onInterrupt: () => void;
  onEnd: () => void;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [messages]);

  return (
    <div className="conv-pane">
      <div className="conv-head">
        <span
          className="vbars"
          data-state={learnerSpeaking ? "listening" : tutorSpeaking ? "speaking" : "idle"}
          aria-hidden="true"
        >
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="status">{statusLabel(status)}</span>
        <span className="spacer" />
        <button className="ghost" onClick={onEnd}>
          End
        </button>
      </div>

      <div className="conv-log" ref={logRef}>
        {messages.length === 0 && (
          <p className="muted center">
            Say "നമസ്കാരം" to begin — ask the tutor to explain, or to quiz you.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`bubble ${m.role} ${m.streaming ? "streaming" : ""}`}
          >
            {m.role === "learner"
              ? m.text || <em>🎤 you spoke</em>
              : m.text || (m.streaming ? "…" : "")}
          </div>
        ))}
      </div>

      <div className="conv-foot">
        <span className="state">
          {learnerSpeaking
            ? "🎙️ listening…"
            : tutorSpeaking
            ? "🔊 tutor speaking…"
            : muted
            ? "🔇 muted"
            : "🎙️ mic on"}
        </span>
        <span className="spacer" />
        {tutorSpeaking && (
          <button className="interrupt" onClick={onInterrupt} title="Stop the tutor (Space)">
            ✋ Interrupt
          </button>
        )}
        <button className="ghost" onClick={onToggleMute}>
          {muted ? "Unmute" : "Mute"}
        </button>
      </div>
    </div>
  );
}
