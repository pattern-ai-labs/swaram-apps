import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

// Closed value sets (used as tool enums + UI labels).
export const APPLIANCES = ["TV", "Refrigerator", "AC", "Washing Machine"];
export const REQUEST_TYPES = ["Repair", "Pickup", "Service"];
export const WARRANTY_OPTIONS = ["Yes", "No", "Not sure"];
export const TIME_BANDS = ["Morning (9am–12pm)", "Afternoon (12pm–4pm)", "Evening (4pm–7pm)"];
export const AREAS = [
  "Kakkanad",
  "Edapally",
  "Kaloor",
  "Vyttila",
  "Palarivattom",
  "Thripunithura",
  "Aluva",
  "Fort Kochi",
  "Ernakulam",
];

const WINDOW_DAYS = 7; // calendar days from today (Sundays skipped)

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export interface Day {
  date: string;
  label: string;
}

/** Working days (Mon–Sat) within the next WINDOW_DAYS calendar days. */
export function workingDays(): Day[] {
  const days: Day[] = [];
  const today = new Date();
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (d.getDay() === 0) continue; // skip Sunday
    days.push({
      date: fmt(d),
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return days;
}

export function today(): string {
  return fmt(new Date());
}

// Each time band ends at a fixed hour; on "today" a band is past once that hour
// is reached (Morning ends 12:00, Afternoon 16:00, Evening 19:00).
const BAND_END_HOUR: Record<string, number> = {
  "Morning (9am–12pm)": 12,
  "Afternoon (12pm–4pm)": 16,
  "Evening (4pm–7pm)": 19,
};
function bandPassedToday(band: string): boolean {
  const end = BAND_END_HOUR[band];
  return end != null && new Date().getHours() >= end;
}
/** Time bands still bookable for a date — all of them for a future date; on today, the ones not yet ended. */
export function timeBandsForDate(date: string): string[] {
  if (date !== today()) return TIME_BANDS;
  return TIME_BANDS.filter((b) => !bandPassedToday(b));
}
/** Offerable working days — today drops off once all of its bands have passed. */
function offerableDays(): Day[] {
  return workingDays().filter((d) => d.date !== today() || timeBandsForDate(d.date).length > 0);
}

// Common spoken synonyms → canonical enum value.
const SYNONYMS: Record<string, string> = {
  fridge: "Refrigerator",
  refrigerator: "Refrigerator",
  "air conditioner": "AC",
  "a/c": "AC",
  ac: "AC",
  television: "TV",
  tv: "TV",
  "washing machine": "Washing Machine",
  washer: "Washing Machine",
};

function resolveFrom(list: string[], input?: string): string | undefined {
  if (!input) return undefined;
  const q = input.toLowerCase().trim();
  const syn = SYNONYMS[q];
  if (syn && list.includes(syn)) return syn;
  return (
    list.find((x) => x.toLowerCase() === q) ||
    list.find((x) => q.includes(x.toLowerCase())) ||
    list.find((x) => x.toLowerCase().includes(q))
  );
}

// ---- types ----
export interface Ticket {
  id: string;
  ref: string; // human-friendly ticket number
  appliance: string;
  requestType: string;
  issue: string;
  warranty: string;
  area: string;
  address: string;
  preferredDate: string;
  preferredTime: string;
  name: string;
  phone: string;
  status: string; // "Draft" | "Scheduled"
  createdAt: string;
  updatedAt: string;
}

// ---- persistence ----
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const FILE = fileURLToPath(new URL("../data/support-tickets.json", import.meta.url));
let tickets: Ticket[] = [];
let counter = 1;

function save(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(tickets, null, 2));
}

export function loadSupportTickets(): void {
  if (existsSync(FILE)) {
    try {
      tickets = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      tickets = [];
    }
  }
  // Continue the ref counter past any existing tickets.
  const maxRef = tickets.reduce((m, t) => {
    const n = Number((t.ref || "").replace(/\D/g, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  counter = maxRef + 1;
}

function nextRef(): string {
  return `SR${String(counter++).padStart(4, "0")}`;
}

// ---- config ----
export function getConfig() {
  return {
    appliances: APPLIANCES,
    requestTypes: REQUEST_TYPES,
    warranty: WARRANTY_OPTIONS,
    areas: AREAS,
    timeBands: TIME_BANDS,
    timeBandsToday: timeBandsForDate(today()), // bands still bookable for today (may be empty)
    days: offerableDays(), // today omitted once all its bands have passed
    today: today(),
  };
}

// ---- request upsert (progressive enrichment) ----
export interface RequestInput {
  id?: string;
  appliance?: string;
  requestType?: string;
  issue?: string;
  warranty?: string;
  area?: string;
  address?: string;
  preferredDate?: string;
  preferredTime?: string;
  name?: string;
  phone?: string;
}

const EMPTY_TICKET = (id: string): Ticket => ({
  id,
  ref: "",
  appliance: "",
  requestType: "",
  issue: "",
  warranty: "",
  area: "",
  address: "",
  preferredDate: "",
  preferredTime: "",
  name: "",
  phone: "",
  status: "Draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Create or merge a ticket. Enum-ish fields are normalized to their canonical value. */
export function saveRequest(input: RequestInput) {
  let t = input.id ? tickets.find((x) => x.id === input.id) : undefined;
  if (!t) {
    t = EMPTY_TICKET(input.id || randomUUID());
    tickets.push(t);
  }
  const setRaw = (k: keyof Ticket, v?: string) => {
    if (typeof v === "string" && v.trim()) (t as any)[k] = v.trim();
  };
  const setEnum = (k: keyof Ticket, list: string[], v?: string) => {
    const hit = resolveFrom(list, v);
    if (hit) (t as any)[k] = hit;
    else setRaw(k, v);
  };
  setEnum("appliance", APPLIANCES, input.appliance);
  setEnum("requestType", REQUEST_TYPES, input.requestType);
  setEnum("warranty", WARRANTY_OPTIONS, input.warranty);
  setEnum("area", AREAS, input.area);
  setEnum("preferredTime", TIME_BANDS, input.preferredTime);
  setRaw("issue", input.issue);
  setRaw("address", input.address);
  setRaw("name", input.name);
  setRaw("phone", input.phone);
  if (input.preferredDate && workingDays().some((d) => d.date === input.preferredDate)) {
    t.preferredDate = input.preferredDate;
  }
  t.updatedAt = new Date().toISOString();
  save();
  return { ok: true as const, ticket: t };
}

export function getTicket(id: string): Ticket | undefined {
  return tickets.find((t) => t.id === id);
}

// ---- finalize ----
export interface ScheduleInput extends RequestInput {
  id?: string;
}

export function scheduleRequest(input: ScheduleInput) {
  // Merge any final fields first.
  const merged = saveRequest(input).ticket;

  const missing: string[] = [];
  if (!merged.appliance) missing.push("appliance");
  if (!merged.requestType) missing.push("request type");
  if (!merged.name) missing.push("name");
  if (!merged.phone || (merged.phone.match(/\d/g) || []).length < 7) missing.push("phone");
  if (!merged.area) missing.push("area");
  if (!merged.preferredDate) missing.push("preferred date");
  if (!merged.preferredTime) missing.push("preferred time");
  if (missing.length) {
    return { ok: false as const, error: `Still need: ${missing.join(", ")}.`, ticket: merged };
  }

  // Don't accept a time band that has already passed for today.
  if (merged.preferredDate === today() && bandPassedToday(merged.preferredTime)) {
    return {
      ok: false as const,
      error: "That time band has already passed for today. Please pick a later band today, or another day.",
      ticket: merged,
    };
  }

  if (merged.status !== "Scheduled") {
    merged.ref = nextRef();
    merged.status = "Scheduled";
    merged.updatedAt = new Date().toISOString();
    save();
  }
  return { ok: true as const, ticket: merged };
}

/** Scheduled tickets, newest first (for the recent queue). */
export function listTickets(): Ticket[] {
  return tickets
    .filter((t) => t.status === "Scheduled")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

// ---- modify / cancel an existing (scheduled) ticket, behind an identity check ----
function normName(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
/** Last 10 digits, so country code / spacing / punctuation don't matter. */
function last10(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}
/** Normalize a ticket ref for matching: uppercase, strip non-alphanumerics. */
function normRef(s: string): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Find a scheduled ticket by ref (exact, or by the numeric part as a fallback). */
function findScheduledByRef(ref: string): Ticket | undefined {
  const want = normRef(ref);
  if (!want) return undefined;
  const wantNum = want.replace(/\D/g, "");
  return tickets.find((t) => {
    if (t.status !== "Scheduled") return false;
    const have = normRef(t.ref);
    return have === want || (!!wantNum && have.replace(/\D/g, "") === wantNum);
  });
}

/**
 * Resolve a ticket the caller is entitled to act on: it must exist AND the
 * supplied name + phone must match. Returns the ticket, or a SINGLE generic
 * error for both "not found" and "mismatch" (so a caller can't probe which refs
 * exist or whose they are). Never echoes the stored name/phone.
 */
function authorizeByRef(ref: string, name: string, phone: string): Ticket | { error: string } {
  const generic = { error: "I couldn't find a matching ticket for that number, name and phone." };
  const t = findScheduledByRef(ref);
  if (!t) return generic;
  const nameOk = normName(t.name) === normName(name);
  const phoneOk = last10(phone).length >= 7 && last10(t.phone) === last10(phone);
  if (!nameOk || !phoneOk) return generic;
  return t;
}

export interface UpdateInput {
  ref: string;
  name: string; // identity (not editable here)
  phone: string; // identity (not editable here)
  appliance?: string;
  requestType?: string;
  issue?: string;
  warranty?: string;
  area?: string;
  address?: string;
  preferredDate?: string;
  preferredTime?: string;
}

/** Modify a scheduled ticket's service details, after the name+phone identity check. */
export function updateTicket(input: UpdateInput) {
  const found = authorizeByRef(input.ref, input.name, input.phone);
  if ("error" in found) return { ok: false as const, error: found.error };
  const t = found;

  // Reject if the resulting (possibly rescheduled) date+band is in the past today.
  const newDate =
    input.preferredDate && workingDays().some((d) => d.date === input.preferredDate)
      ? input.preferredDate
      : t.preferredDate;
  const newBand =
    typeof input.preferredTime === "string" && input.preferredTime.trim()
      ? resolveFrom(TIME_BANDS, input.preferredTime) ?? input.preferredTime.trim()
      : t.preferredTime;
  if (newDate === today() && bandPassedToday(newBand)) {
    return {
      ok: false as const,
      error: "That time band has already passed for today. Please pick a later band today, or another day.",
    };
  }

  const setRaw = (k: keyof Ticket, v?: string) => {
    if (typeof v === "string" && v.trim()) (t as any)[k] = v.trim();
  };
  const setEnum = (k: keyof Ticket, list: string[], v?: string) => {
    if (typeof v !== "string" || !v.trim()) return;
    (t as any)[k] = resolveFrom(list, v) ?? v.trim();
  };
  setEnum("appliance", APPLIANCES, input.appliance);
  setEnum("requestType", REQUEST_TYPES, input.requestType);
  setEnum("warranty", WARRANTY_OPTIONS, input.warranty);
  setEnum("area", AREAS, input.area);
  setEnum("preferredTime", TIME_BANDS, input.preferredTime);
  setRaw("issue", input.issue);
  setRaw("address", input.address);
  if (input.preferredDate && workingDays().some((d) => d.date === input.preferredDate)) {
    t.preferredDate = input.preferredDate;
  }
  t.updatedAt = new Date().toISOString();
  save();
  return { ok: true as const, ticket: t };
}

/** Cancel a scheduled ticket (keeps the ref for audit), after the identity check. */
export function cancelTicket(input: { ref: string; name: string; phone: string }) {
  const found = authorizeByRef(input.ref, input.name, input.phone);
  if ("error" in found) return { ok: false as const, error: found.error };
  found.status = "Cancelled";
  found.updatedAt = new Date().toISOString();
  save();
  return { ok: true as const, ticket: found };
}
