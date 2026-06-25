import { Router } from "express";
import multer from "multer";
import { randomUUID } from "node:crypto";
import { briefFromPdf, briefFromText } from "../bedrock.js";
import { saveLesson, type SavedLesson } from "../lessons.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — "mostly small docs"
});

export const ingestRouter = Router();

/**
 * Ingestion runs in the BACKGROUND. Bedrock can take minutes on a large,
 * dense document (we keep the full, faithful `cleanedText` extraction — no
 * shortening, any language). If we awaited that inside the HTTP request it
 * would blow past a reverse-proxy / Cloudflare ~100s limit and 524.
 *
 * So: POST /api/ingest returns a { jobId } immediately and processes off to the
 * side; the client polls GET /api/ingest/status/:jobId. Each request is short.
 * On success the lesson is auto-saved to the library, so even if the client
 * stops polling (tab closed), the finished lesson still appears under "Saved".
 */
type Job =
  | { status: "processing"; createdAt: number }
  | { status: "done"; createdAt: number; lesson: SavedLesson }
  | { status: "error"; createdAt: number; error: string };

const jobs = new Map<string, Job>();

// Keep memory bounded: drop finished jobs after an hour.
const JOB_TTL_MS = 60 * 60 * 1000;
function sweep() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.status !== "processing" && now - job.createdAt > JOB_TTL_MS) jobs.delete(id);
  }
}

function run(jobId: string, work: () => Promise<SavedLesson>) {
  work()
    .then((lesson) => jobs.set(jobId, { status: "done", createdAt: Date.now(), lesson }))
    .catch((err: any) => {
      console.error("[ingest] job error:", err?.message ?? err);
      const msg =
        err?.name === "AccessDeniedException"
          ? "Bedrock access denied — check the API key / model access."
          : err?.message ?? "Failed to process the document.";
      jobs.set(jobId, { status: "error", createdAt: Date.now(), error: msg });
    });
}

/**
 * POST /api/ingest
 * multipart/form-data with EITHER field "file" (.pdf/.txt) or field "text".
 * Returns { jobId } right away; processing continues in the background.
 */
ingestRouter.post("/", upload.single("file"), (req, res) => {
  const file = req.file;
  const pastedText = typeof req.body?.text === "string" ? req.body.text : "";

  let work: (() => Promise<SavedLesson>) | null = null;

  if (file) {
    const name = file.originalname || "lesson";
    const isPdf =
      file.mimetype === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    if (isPdf) {
      const bytes = new Uint8Array(file.buffer); // captured now; safe to use after we respond
      work = async () => saveLesson(await briefFromPdf(bytes, name), bytes);
    } else {
      const text = file.buffer.toString("utf8").trim();
      if (!text) return res.status(400).json({ error: "The file is empty." });
      work = async () => saveLesson(await briefFromText(text, name));
    }
  } else if (pastedText.trim()) {
    const text = pastedText.trim();
    work = async () => saveLesson(await briefFromText(text, "Lesson"));
  }

  if (!work) {
    return res.status(400).json({ error: "Provide a 'file' (.pdf/.txt) or 'text'." });
  }

  sweep();
  const jobId = randomUUID();
  jobs.set(jobId, { status: "processing", createdAt: Date.now() });
  run(jobId, work);
  return res.status(202).json({ jobId, status: "processing" });
});

/**
 * GET /api/ingest/status/:jobId
 * → { status: "processing" } | { status: "done", lesson } | { status: "error", error }
 */
ingestRouter.get("/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({
      status: "error",
      error: "Unknown job — it may have expired. Please upload again.",
    });
  }
  if (job.status === "done") return res.json({ status: "done", lesson: job.lesson });
  if (job.status === "error") return res.json({ status: "error", error: job.error });
  return res.json({ status: "processing" });
});
