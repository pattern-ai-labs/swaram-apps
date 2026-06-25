import type { SavedLesson } from "../types";

/**
 * Start ingestion. Returns a jobId immediately; the document is processed in
 * the background (Bedrock can take a while on big docs). Poll getIngestStatus.
 */
export async function ingest(payload: {
  file?: File;
  text?: string;
}): Promise<{ jobId: string }> {
  const fd = new FormData();
  if (payload.file) fd.append("file", payload.file);
  if (payload.text) fd.append("text", payload.text);
  const r = await fetch("/api/ingest", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.jobId) throw new Error(j.error || "Could not process the document.");
  return { jobId: j.jobId as string };
}

export type IngestStatus =
  | { status: "processing" }
  | { status: "done"; lesson: SavedLesson }
  | { status: "error"; error: string };

/** Poll the status of a background ingest job. */
export async function getIngestStatus(jobId: string): Promise<IngestStatus> {
  const r = await fetch(`/api/ingest/status/${jobId}`);
  const j = await r.json().catch(() => ({}));
  if (j.status === "done") return { status: "done", lesson: j.lesson as SavedLesson };
  if (j.status === "error") return { status: "error", error: j.error || "Processing failed." };
  return { status: "processing" };
}

/** Mint a short-lived swaram ephemeral token via our backend. */
export async function getSwaramToken(
  body?: Record<string, unknown>
): Promise<{ token: string }> {
  const r = await fetch("/api/swaram-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.token) throw new Error(j.error || "Could not start the voice session.");
  return { token: j.token as string };
}
