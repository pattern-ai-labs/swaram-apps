import { useRef, useState } from "react";

export default function UploadDropzone({
  onSubmit,
  busy,
}: {
  onSubmit: (p: { file?: File; text?: string }) => void;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="dropzone-wrap">
      <div className="tabs">
        <button className={tab === "file" ? "on" : ""} onClick={() => setTab("file")}>
          Upload file
        </button>
        <button className={tab === "text" ? "on" : ""} onClick={() => setTab("text")}>
          Paste text
        </button>
      </div>

      {tab === "file" ? (
        <div
          className={`drop ${drag ? "drag" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const f = e.dataTransfer.files?.[0];
            if (f) onSubmit({ file: f });
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,text/plain,application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onSubmit({ file: f });
            }}
          />
          <p className="drop-main">📄 Drop a PDF or .txt here, or click to choose</p>
          <p className="muted">Extracted with Claude Sonnet 4.6 on Amazon Bedrock.</p>
        </div>
      ) : (
        <div className="paste">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your lesson text here…"
            rows={8}
          />
          <button
            className="primary"
            disabled={busy || !text.trim()}
            onClick={() => onSubmit({ text })}
          >
            Use this text
          </button>
        </div>
      )}
    </div>
  );
}
