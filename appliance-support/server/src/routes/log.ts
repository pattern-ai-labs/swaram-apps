import { Router } from "express";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../data/", import.meta.url));
const FILE = fileURLToPath(new URL("../data/conversations.jsonl", import.meta.url));

export const logRouter = Router();

/** Append one conversation event (full transcript, tool calls, bookings, …). */
logRouter.post("/log", (req, res) => {
  try {
    if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
    const line = JSON.stringify({ ...req.body, receivedAt: new Date().toISOString() });
    appendFileSync(FILE, line + "\n");
    res.json({ ok: true });
  } catch {
    res.status(500).json({ ok: false });
  }
});

/** Read events back for analysis. ?session=<id> filters to one call. */
logRouter.get("/logs", (req, res) => {
  if (!existsSync(FILE)) return res.json({ events: [] });
  let events = readFileSync(FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const session = typeof req.query.session === "string" ? req.query.session : undefined;
  if (session) events = events.filter((e: any) => e.sessionId === session);
  res.json({ events: events.slice(-1000) });
});
