import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, LessonMeta, StudyBrief, Voice } from "../types";
import { ingest, getIngestStatus, getSwaramToken } from "../lib/api";
import { listLessons, getLesson, deleteLesson, lessonPdfUrl } from "../lib/lessonsApi";
import { SwaramSession } from "../lib/swaramClient";
import { MicCapture } from "../audio/micCapture";
import { PcmPlayer } from "../audio/player";
import UploadDropzone from "../components/UploadDropzone";
import LessonPane from "../components/LessonPane";
import ConversationPane from "../components/ConversationPane";

type Phase = "upload" | "processing" | "ready" | "live" | "ended";
const MODEL = "mal-realtime-simple";

function buildInstructions(b: StudyBrief, agent: string): string {
  const kp = b.keyPoints.map((p) => "- " + p).join("\n");
  return [
    `You are a warm, patient Malayalam tutor named "${agent}".`,
    "Teach the learner ONLY from the lesson material below.",
    "You can both EXPLAIN concepts and QUIZ the learner.",
    "Greet them in Malayalam, ask whether they want an explanation or a quiz, and switch whenever they ask.",
    "Keep replies short and conversational. Speak natural Malayalam; common English technical terms are fine.",
    "If asked something outside the material, gently say it is not in the lesson.",
    "",
    `--- LESSON: ${b.title} ---`,
    b.summary ? `SUMMARY: ${b.summary}` : "",
    kp ? `KEY POINTS:\n${kp}` : "",
    "",
    "FULL TEXT:",
    b.cleanedText,
  ]
    .filter(Boolean)
    .join("\n");
}

let _id = 0;
const nextId = () => `m${++_id}`;

export default function Tutor() {
  const [phase, setPhase] = useState<Phase>("upload");
  const [brief, setBrief] = useState<StudyBrief | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState<LessonMeta[]>([]);
  const [voice, setVoice] = useState<Voice>("mal-female");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("idle");
  const [tutorSpeaking, setTutorSpeaking] = useState(false);
  const [learnerSpeaking, setLearnerSpeaking] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0); // seconds spent processing
  const pollAbortRef = useRef(false);

  const sessionRef = useRef<SwaramSession | null>(null);
  const micRef = useRef<MicCapture | null>(null);
  const playerRef = useRef<PcmPlayer | null>(null);
  const tutorMsgRef = useRef<string | null>(null);
  // While true the tutor has the turn and the mic is held (half-duplex), so our
  // stream can't make swaram cancel its own reply. The learner cuts in with the
  // explicit Interrupt control instead.
  const micGateRef = useRef(false);
  const tutorSpeakingRef = useRef(false);
  // Pending "playback finished" timer (keeps the tutor "speaking" until the
  // queued audio actually drains, not just until generation ends).
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDrainTimer = useCallback(() => {
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current);
      drainTimerRef.current = null;
    }
  }, []);

  const loadSaved = useCallback(() => {
    listLessons().then(setSaved).catch(() => {});
  }, []);
  useEffect(() => loadSaved(), [loadSaved]);

  const onSubmit = useCallback(
    async (p: { file?: File; text?: string }) => {
      setError(null);
      setElapsed(0);
      setPhase("processing");
      pollAbortRef.current = false;
      const startedAt = Date.now();
      const tick = setInterval(
        () => setElapsed(Math.round((Date.now() - startedAt) / 1000)),
        1000
      );
      try {
        // Kick off background processing; we get a job id back immediately.
        const { jobId } = await ingest(p);
        // Poll until the document is processed (Bedrock can take a while on big
        // docs). Each poll is a short request, so it never hits a proxy timeout.
        const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (pollAbortRef.current) return; // user navigated away
          const s = await getIngestStatus(jobId);
          if (s.status === "done") {
            setBrief(s.lesson);
            setFile(p.file ?? null); // fresh upload renders its PDF from the File
            setPdfUrl(null);
            setPhase("ready");
            loadSaved(); // it now appears in the library
            return;
          }
          if (s.status === "error") throw new Error(s.error);
          await sleep(3000);
        }
      } catch (e: any) {
        if (!pollAbortRef.current) {
          setError(e.message);
          setPhase("upload");
        }
      } finally {
        clearInterval(tick);
      }
    },
    [loadSaved]
  );

  // Stop polling if the component unmounts (the job keeps running server-side
  // and the finished lesson will appear under "Saved lessons").
  useEffect(() => () => {
    pollAbortRef.current = true;
  }, []);

  const takeLesson = useCallback(async (id: string, hasPdf: boolean) => {
    setError(null);
    setPhase("processing");
    try {
      const lesson = await getLesson(id);
      setBrief(lesson);
      setFile(null);
      setPdfUrl(hasPdf ? lessonPdfUrl(id) : null);
      setPhase("ready");
    } catch (e: any) {
      setError(e.message);
      setPhase("upload");
    }
  }, []);

  const removeLesson = useCallback(
    async (id: string) => {
      await deleteLesson(id);
      loadSaved();
    },
    [loadSaved]
  );

  const appendTutorDelta = useCallback((delta: string) => {
    setMessages((prev) => {
      const id = tutorMsgRef.current;
      // append only if the bubble still exists; otherwise start a fresh one
      if (id && prev.some((m) => m.id === id)) {
        return prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m));
      }
      const nid = nextId();
      tutorMsgRef.current = nid;
      return [...prev, { id: nid, role: "tutor", text: delta, streaming: true }];
    });
  }, []);

  // Learner-side transcript from swaram's native input transcription —
  // one complete event per turn.
  const addLearnerTranscript = useCallback((transcript: string) => {
    const text = transcript.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: nextId(), role: "learner", text }]);
  }, []);

  const start = useCallback(async () => {
    if (!brief) return;
    setError(null);
    micGateRef.current = false;
    clearDrainTimer();
    try {
      const player = new PcmPlayer();
      await player.resume();
      playerRef.current = player;

      const { token } = await getSwaramToken({ session: { model: MODEL } });

      const session = new SwaramSession({
        onStatus: setStatus,
        onTutorTurnStart: () => {
          clearDrainTimer(); // cancel any stale drain from a previous reply
          setTutorSpeaking(true);
          tutorSpeakingRef.current = true;
          tutorMsgRef.current = null;
          // Hold the mic during the reply so we never cancel it by accident.
          micGateRef.current = true;
        },
        onTutorTranscriptDelta: appendTutorDelta,
        onTutorTurnEnd: () => {
          // Generation finished, but audio is still playing (swaram streams
          // faster than real time). Keep "speaking" — and the Interrupt button —
          // until the queued audio actually drains, then hand the turn back.
          setMessages((prev) =>
            prev.map((m) =>
              m.id === tutorMsgRef.current ? { ...m, streaming: false } : m
            )
          );
          tutorMsgRef.current = null;
          clearDrainTimer();
          const wait = (playerRef.current?.remainingMs() ?? 0) + 300;
          drainTimerRef.current = setTimeout(() => {
            setTutorSpeaking(false);
            tutorSpeakingRef.current = false;
            micGateRef.current = false;
            drainTimerRef.current = null;
          }, wait);
        },
        onAudioDelta: (b64) => playerRef.current?.enqueue(b64),
        onLearnerSpeechStart: () => {
          setLearnerSpeaking(true);
          playerRef.current?.flush();
          setTutorSpeaking(false);
          tutorSpeakingRef.current = false;
        },
        onLearnerSpeechStop: () => setLearnerSpeaking(false),
        onLearnerTranscript: addLearnerTranscript,
        onError: (msg) => {
          micGateRef.current = false; // don't get stuck muted on an error
          setError(msg);
        },
      });
      sessionRef.current = session;
      session.connect({
        token,
        model: MODEL,
        instructions: buildInstructions(brief, voice === "mal-male" ? "Govind" : "Gita"),
        voice,
      });

      const mic = new MicCapture();
      micRef.current = mic;
      await mic.start((b64) => {
        // Half-duplex: while the tutor speaks the mic is held, so we never make
        // swaram cancel its own reply. Use Interrupt/Space to cut in.
        if (micGateRef.current) return;
        sessionRef.current?.sendAudio(b64);
      });

      setMuted(false);
      setPhase("live");
    } catch (e: any) {
      setError(e.message || "Could not start the session.");
    }
  }, [brief, voice, appendTutorDelta, addLearnerTranscript, clearDrainTimer]);

  const end = useCallback(async () => {
    clearDrainTimer();
    await micRef.current?.stop();
    micRef.current = null;
    sessionRef.current?.close();
    sessionRef.current = null;
    await playerRef.current?.close();
    playerRef.current = null;
    setTutorSpeaking(false);
    tutorSpeakingRef.current = false;
    setLearnerSpeaking(false);
    setPhase("ended");
  }, [clearDrainTimer]);

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

  // Explicit barge-in: stop the tutor's reply and hand the turn back to the user.
  const interrupt = useCallback(() => {
    if (!tutorSpeakingRef.current) return;
    clearDrainTimer();
    playerRef.current?.flush(); // stop audio now
    sessionRef.current?.cancel(); // tell swaram to stop the reply
    micGateRef.current = false; // reopen the mic
    setTutorSpeaking(false);
    tutorSpeakingRef.current = false;
  }, [clearDrainTimer]);

  // (Space-to-interrupt is handled centrally in ConversationPane.)

  const restart = useCallback(() => {
    setMessages([]);
    setStatus("idle");
    setPhase("ready");
  }, []);

  // Go back to the upload screen for a brand-new lesson.
  const newLesson = useCallback(() => {
    setMessages([]);
    setStatus("idle");
    setBrief(null);
    setFile(null);
    setPdfUrl(null);
    setError(null);
    setPhase("upload");
    loadSaved();
  }, [loadSaved]);

  return (
    <div className="tutor">
      <header className="topbar">
        <span className="brand">സ്വരം</span>
        <span className="sep" />
        <h1>Malayalam Tutor</h1>
        <span className="spacer" />
      </header>

      {error && <div className="error-bar">{error}</div>}

      {phase === "upload" && (
        <div className="center-stage">
          <h2>Upload a lesson to learn</h2>
          <p className="muted">
            PDF or text — the tutor will teach it to you in Malayalam.
          </p>
          <UploadDropzone onSubmit={onSubmit} busy={false} />

          {saved.length > 0 && (
            <div className="saved-lessons">
              <div className="saved-head">Saved lessons</div>
              <ul>
                {saved.map((l) => (
                  <li key={l.id} className="saved-item">
                    <button className="saved-take" onClick={() => takeLesson(l.id, l.hasPdf)}>
                      <span className="saved-title">{l.title}</span>
                      <span className="saved-meta">
                        {l.kind === "pdf" ? "PDF" : "Text"} ·{" "}
                        {new Date(l.createdAt).toLocaleDateString()}
                      </span>
                    </button>
                    <button
                      className="saved-del"
                      title="Delete lesson"
                      onClick={() => removeLesson(l.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {phase === "processing" && (
        <div className="center-stage">
          <div className="spinner" />
          <p>പാഠം തയ്യാറാക്കുന്നു… (preparing your lesson)</p>
          <p className="muted">
            Reading the whole document — this can take a minute or two for large
            files. {elapsed > 0 && `Elapsed: ${elapsed}s.`} You can keep this tab
            open; the finished lesson will also appear under <strong>Saved lessons</strong>.
          </p>
        </div>
      )}

      {(phase === "ready" || phase === "live" || phase === "ended") && brief && (
        <div className="split">
          <LessonPane brief={brief} file={file} pdfUrl={pdfUrl} />
          <div className="right">
            {phase === "ready" ? (
              <div className="ready-panel">
                <h3>Ready to learn “{brief.title}”</h3>
                <label className="voice-pick">
                  Tutor voice
                  <select value={voice} onChange={(e) => setVoice(e.target.value as Voice)}>
                    <option value="mal-female">Malayalam — female</option>
                    <option value="mal-male">Malayalam — male</option>
                  </select>
                </label>
                <button className="primary big" onClick={start}>
                  🎙️ Start learning
                </button>
                <p className="muted">
                  While the tutor speaks, press <strong>Interrupt</strong> (or the{" "}
                  <strong>Space</strong> key) to cut in. Headphones recommended.
                </p>
              </div>
            ) : (
              <>
                <ConversationPane
                  messages={messages}
                  status={status}
                  tutorSpeaking={tutorSpeaking}
                  learnerSpeaking={learnerSpeaking}
                  muted={muted}
                  onToggleMute={toggleMute}
                  onInterrupt={interrupt}
                  onEnd={end}
                />
                {phase === "ended" && (
                  <div className="ended-note">
                    Session ended.{" "}
                    <button className="link" onClick={restart}>
                      Start again
                    </button>{" "}
                    ·{" "}
                    <button className="link" onClick={newLesson}>
                      New lesson
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
