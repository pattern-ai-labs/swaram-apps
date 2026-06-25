export type Voice = "mal-female" | "mal-male";

export interface StudyBrief {
  title: string;
  summary: string;
  keyPoints: string[];
  cleanedText: string;
  kind: "pdf" | "text";
}

/** A persisted lesson (full, incl. cleanedText) — returned by ingest and GET /:id. */
export interface SavedLesson extends StudyBrief {
  id: string;
  createdAt: string;
  hasPdf: boolean;
}

/** Lightweight list entry (no cleanedText). */
export interface LessonMeta {
  id: string;
  title: string;
  summary: string;
  keyPoints: string[];
  kind: "pdf" | "text";
  hasPdf: boolean;
  createdAt: string;
}

export type Role = "tutor" | "learner";

export interface ChatMessage {
  id: string;
  role: Role;
  text: string;
  streaming?: boolean;
}
