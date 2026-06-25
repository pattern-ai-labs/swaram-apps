import type { LessonMeta, SavedLesson } from "../types";

export async function listLessons(): Promise<LessonMeta[]> {
  const r = await fetch("/api/lessons");
  if (!r.ok) return [];
  return (await r.json()).lessons as LessonMeta[];
}

export async function getLesson(id: string): Promise<SavedLesson> {
  const r = await fetch(`/api/lessons/${id}`);
  if (!r.ok) throw new Error("Could not load the lesson.");
  return r.json();
}

export async function deleteLesson(id: string): Promise<void> {
  await fetch(`/api/lessons/${id}`, { method: "DELETE" });
}

export const lessonPdfUrl = (id: string) => `/api/lessons/${id}/pdf`;
