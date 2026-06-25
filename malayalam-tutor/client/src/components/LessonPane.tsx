import { useState } from "react";
import type { StudyBrief } from "../types";
import PdfViewer from "./PdfViewer";

export default function LessonPane({
  brief,
  file,
  pdfUrl,
}: {
  brief: StudyBrief;
  file: File | null;
  pdfUrl?: string | null;
}) {
  // PDF source is the freshly-uploaded File, or a saved lesson's URL.
  const pdfSource: File | string | null = file ?? pdfUrl ?? null;
  const hasPdf = brief.kind === "pdf" && !!pdfSource;
  const [view, setView] = useState<"pdf" | "text">(hasPdf ? "pdf" : "text");

  return (
    <div className="lesson-pane">
      <div className="lesson-head">
        <h2 title={brief.title}>{brief.title}</h2>
        {hasPdf && (
          <div className="toggle">
            <button className={view === "pdf" ? "on" : ""} onClick={() => setView("pdf")}>
              PDF
            </button>
            <button className={view === "text" ? "on" : ""} onClick={() => setView("text")}>
              Text
            </button>
          </div>
        )}
      </div>

      {brief.summary && (
        <details className="brief-card" open>
          <summary>AI summary &amp; key points</summary>
          <p>{brief.summary}</p>
          {brief.keyPoints.length > 0 && (
            <ul>
              {brief.keyPoints.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div className="lesson-body">
        {hasPdf && view === "pdf" && pdfSource ? (
          <PdfViewer source={pdfSource} />
        ) : (
          <pre className="lesson-text">{brief.cleanedText}</pre>
        )}
      </div>
    </div>
  );
}
