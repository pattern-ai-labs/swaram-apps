import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import type { StudyBrief } from "./bedrock.js";

export interface SavedLesson extends StudyBrief {
  id: string;
  createdAt: string;
  hasPdf: boolean;
}

const DIR = fileURLToPath(new URL("../data/", import.meta.url));
const PDF_DIR = fileURLToPath(new URL("../data/lessons/", import.meta.url));
const FILE = fileURLToPath(new URL("../data/lessons.json", import.meta.url));

let lessons: SavedLesson[] = [];

function ensureDirs(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  if (!existsSync(PDF_DIR)) mkdirSync(PDF_DIR, { recursive: true });
}

function persist(): void {
  ensureDirs();
  writeFileSync(FILE, JSON.stringify(lessons, null, 2));
}

export function loadLessons(): void {
  if (existsSync(FILE)) {
    try {
      lessons = JSON.parse(readFileSync(FILE, "utf8"));
      return;
    } catch {
      /* fall through */
    }
  }
  lessons = [];
}

/** Persist a freshly-ingested lesson (+ the original PDF when present). */
export function saveLesson(brief: StudyBrief, pdfBytes?: Uint8Array): SavedLesson {
  ensureDirs();
  const id = randomUUID();
  const hasPdf = brief.kind === "pdf" && !!pdfBytes && pdfBytes.length > 0;
  if (hasPdf && pdfBytes) writeFileSync(`${PDF_DIR}${id}.pdf`, pdfBytes);
  const lesson: SavedLesson = {
    ...brief,
    id,
    createdAt: new Date().toISOString(),
    hasPdf,
  };
  lessons.unshift(lesson); // newest first
  persist();
  return lesson;
}

/** Lightweight list (no full cleanedText). */
export function listLessons() {
  return lessons.map(({ cleanedText: _omit, ...meta }) => meta);
}

export function getLesson(id: string): SavedLesson | null {
  return lessons.find((l) => l.id === id) ?? null;
}

export function getPdfPath(id: string): string | null {
  const p = `${PDF_DIR}${id}.pdf`;
  return existsSync(p) ? p : null;
}

export function deleteLesson(id: string): boolean {
  const i = lessons.findIndex((l) => l.id === id);
  if (i < 0) return false;
  const [removed] = lessons.splice(i, 1);
  if (removed.hasPdf) {
    try {
      rmSync(`${PDF_DIR}${id}.pdf`);
    } catch {
      /* ignore */
    }
  }
  persist();
  return true;
}
