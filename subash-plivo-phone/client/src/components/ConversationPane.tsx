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
    const el = logRef.current;
    if (!el) return;
    // Only auto-scroll if the user is already near the bottom, so scrolling up to
    // read earlier messages isn't yanked back down on each new message.
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTo({ top: el.scrollHeight });
  }, [messages]);

  // Space interrupts the agent while it's speaking (half-duplex; the mic is held,
  // so Space / the Interrupt button are how the user cuts in).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && tutorSpeaking) {
        e.preventDefault();
        onInterrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tutorSpeaking, onInterrupt]);

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
            className={`bubble msg-${m.role} ${m.streaming ? "streaming" : ""}`}
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
            ? "🔊 agent speaking…"
            : muted
            ? "🔇 muted"
            : "🎙️ mic on"}
        </span>
        <span className="spacer" />
        {tutorSpeaking && (
          <button className="interrupt" onClick={onInterrupt} title="Stop the agent (Space)">
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
