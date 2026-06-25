import { Router } from "express";
import { listLessons, getLesson, getPdfPath, deleteLesson } from "../lessons.js";

export const lessonsRouter = Router();

/** List saved lessons (metadata, no full text). */
lessonsRouter.get("/", (_req, res) => {
  res.json({ lessons: listLessons() });
});

/** Original PDF of a saved lesson (registered before "/:id"). */
lessonsRouter.get("/:id/pdf", (req, res) => {
  const path = getPdfPath(req.params.id);
  if (!path) return res.status(404).end();
  res.type("application/pdf").sendFile(path);
});

/** Full lesson (incl. cleanedText) to re-take it. */
lessonsRouter.get("/:id", (req, res) => {
  const lesson = getLesson(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found." });
  res.json(lesson);
});

lessonsRouter.delete("/:id", (req, res) => {
  res.json({ ok: deleteLesson(req.params.id) });
});
