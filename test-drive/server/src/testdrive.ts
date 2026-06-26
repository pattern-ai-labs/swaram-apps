import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { activeBrand, type CarModel } from "./carCatalog.js";

export interface Dealership {
  id: string;
  name: string;
  area: string;
}

/** Enrichment value sets are configurable; finance is a fixed Yes/No. */
export const YESNO_OPTIONS = ["Yes", "No"];

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Operator-editable test-drive configuration (see testdrive-config.json). */
export interface TestDriveConfigFile {
  windowDays: number;
  slotMinutes: number;
  workingDays: string[];
  hours: [string, string][];
  brand: { id: string; name: string };
  dealerships: Dealership[];
  models: CarModel[];
  enrich: {
    budget: string[];
    fuel: string[];
    transmission: string[];
    timeline: string[];
  };
}

/** Built-in defaults; written to testdrive-config.json on first run, then editable. */
const DEFAULT_CONFIG: TestDriveConfigFile = {
  windowDays: 7,
  slotMinutes: 30,
  workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  hours: [["09:00", "13:00"], ["14:00", "17:00"]],
  brand: { id: activeBrand().id, name: activeBrand().name },
  // Same Maruti locations as the service centres, here acting as dealerships.
  dealerships: [
    { id: "kakkanad", name: "Kakkanad", area: "Kakkanad" },
    { id: "thripunithura", name: "Thripunithura", area: "Thripunithura" },
    { id: "edapally", name: "Edapally", area: "Edapally" },
    { id: "ernakulam", name: "Ernakulam", area: "Ernakulam (M.G. Road)" },
  ],
  models: activeBrand().models,
  enrich: {
    budget: ["Under ₹6 lakh", "₹6–10 lakh", "₹10–15 lakh", "Above ₹15 lakh"],
    fuel: ["Petrol", "Diesel", "CNG", "Hybrid"],
    transmission: ["Manual", "Automatic"],
    timeline: ["This month", "1–3 months", "Just exploring"],
  },
};

let config: TestDriveConfigFile = DEFAULT_CONFIG;

/** Dealerships from the live (operator-editable) config. A live `let` binding. */
export let DEALERSHIPS: Dealership[] = config.dealerships;

/** Model names from config (used for enum constraints / matching). */
export function modelNames(): string[] {
  return config.models.map((m) => m.name);
}

export function slotTimes(): string[] {
  const out: string[] = [];
  for (const [start, end] of config.hours) {
    let [h, m] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    while (h < eh || (h === eh && m < em)) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += config.slotMinutes;
      while (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
  }
  return out;
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export interface Day {
  date: string;
  label: string;
}

export function workingDays(): Day[] {
  const days: Day[] = [];
  const open = new Set(config.workingDays);
  const today = new Date();
  for (let i = 0; i < config.windowDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (!open.has(WEEKDAYS[d.getDay()])) continue;
    days.push({
      date: fmt(d),
      label: d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    });
  }
  return days;
}

/** "Mon–Sat" when contiguous, else "Mon, Wed, Fri". */
export function daysLabel(): string {
  const idx = config.workingDays
    .map((w) => (WEEKDAYS as readonly string[]).indexOf(w))
    .sort((a, b) => a - b);
  const contiguous = idx.every((n, i) => i === 0 || n === idx[i - 1] + 1);
  if (contiguous && idx.length > 2) return `${WEEKDAYS[idx[0]]}–${WEEKDAYS[idx[idx.length - 1]]}`;
  return idx.map((n) => WEEKDAYS[n]).join(", ");
}

/** "9:00–13:00, 14:00–17:00" from the configured hour windows. */
export function hoursLabel(): string {
  const trim = (t: string) => t.replace(/^0/, "");
  return config.hours.map(([s, e]) => `${trim(s)}–${trim(e)}`).join(", ");
}

export function today(): string {
  return fmt(new Date());
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function resolveDealership(input: string): Dealership | null {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  return (
    DEALERSHIPS.find((c) => c.id === q) ||
    DEALERSHIPS.find((c) => c.name.toLowerCase() === q) ||
    DEALERSHIPS.find((c) => q.includes(c.name.toLowerCase())) ||
    DEALERSHIPS.find((c) => c.name.toLowerCase().includes(q)) ||
    null
  );
}

function normalizeModels(input: unknown): string[] {
  const names = modelNames();
  const raw = Array.isArray(input)
    ? input
    : typeof input === "string"
    ? input.split(/[,/]| and /i)
    : [];
  const out: string[] = [];
  for (const item of raw) {
    const q = String(item).toLowerCase().trim();
    if (!q) continue;
    const hit =
      names.find((m) => m.toLowerCase() === q) ||
      names.find((m) => q.includes(m.toLowerCase())) ||
      names.find((m) => m.toLowerCase().includes(q));
    const val = hit ?? String(item).trim();
    if (val && !out.includes(val)) out.push(val);
  }
  return out;
}

// ---- types ----
export interface Lead {
  id: string;
  name: string;
  phone: string;
  city: string;
  interestedModels: string[];
  budget: string;
  fuel: string;
  transmission: string;
  timeline: string;
  exchange: string; // old car for exchange, or "" / "No"
  finance: string; // "Yes" / "No" / ""
  createdAt: string;
  updatedAt: string;
}

export interface TestDrive {
  id: string;
  leadId: string;
  dealershipId: string;
  carModel: string;
  date: string;
  time: string;
  name: string;
  phone: string;
  createdAt: string;
}

// ---- persistence ----
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const LEADS_FILE = fileURLToPath(new URL("../data/leads.json", import.meta.url));
const TD_FILE = fileURLToPath(new URL("../data/testdrive-bookings.json", import.meta.url));
const CONFIG_FILE = fileURLToPath(new URL("../data/testdrive-config.json", import.meta.url));
let leads: Lead[] = [];
let testdrives: TestDrive[] = [];

/** Load the operator-editable config (dealerships, hours, models, enrich sets). On first
 *  run it writes the defaults to testdrive-config.json; edit + restart to change it. */
export function loadConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as TestDriveConfigFile;
      if (parsed?.dealerships?.length && parsed?.models?.length) {
        config = {
          windowDays: parsed.windowDays || DEFAULT_CONFIG.windowDays,
          slotMinutes: parsed.slotMinutes || DEFAULT_CONFIG.slotMinutes,
          workingDays: parsed.workingDays?.length ? parsed.workingDays : DEFAULT_CONFIG.workingDays,
          hours: parsed.hours?.length ? parsed.hours : DEFAULT_CONFIG.hours,
          brand: parsed.brand || DEFAULT_CONFIG.brand,
          dealerships: parsed.dealerships,
          models: parsed.models,
          enrich: { ...DEFAULT_CONFIG.enrich, ...(parsed.enrich || {}) },
        };
        DEALERSHIPS = config.dealerships;
        return;
      }
    } catch {
      /* fall through to defaults */
    }
  }
  config = DEFAULT_CONFIG;
  DEALERSHIPS = config.dealerships;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
}

function saveLeads(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}
function saveTestDrives(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TD_FILE, JSON.stringify(testdrives, null, 2));
}

export function loadTestDriveData(): void {
  loadConfig();
  if (existsSync(LEADS_FILE)) {
    try {
      leads = JSON.parse(readFileSync(LEADS_FILE, "utf8"));
    } catch {
      leads = [];
    }
  }
  if (existsSync(TD_FILE)) {
    try {
      testdrives = JSON.parse(readFileSync(TD_FILE, "utf8"));
    } catch {
      testdrives = [];
    }
  }
}

// ---- config ----
export function getConfig() {
  return {
    brand: config.brand,
    models: config.models, // full attributes for recommendation + the lineup view
    modelNames: modelNames(),
    dealerships: DEALERSHIPS,
    slots: slotTimes(),
    days: workingDays(),
    today: today(),
    hoursLabel: hoursLabel(),
    daysLabel: daysLabel(),
    enrich: {
      budget: config.enrich.budget,
      fuel: config.enrich.fuel,
      transmission: config.enrich.transmission,
      timeline: config.enrich.timeline,
      finance: YESNO_OPTIONS,
    },
  };
}

// ---- lead upsert ----
export interface LeadInput {
  id?: string;
  name?: string;
  phone?: string;
  city?: string;
  interestedModels?: string[] | string;
  budget?: string;
  fuel?: string;
  transmission?: string;
  timeline?: string;
  exchange?: string;
  finance?: string;
}

const EMPTY_LEAD = (id: string): Lead => ({
  id,
  name: "",
  phone: "",
  city: "",
  interestedModels: [],
  budget: "",
  fuel: "",
  transmission: "",
  timeline: "",
  exchange: "",
  finance: "",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Create or merge a lead. Only provided fields overwrite; others are kept. */
export function saveLead(input: LeadInput) {
  let lead = input.id ? leads.find((l) => l.id === input.id) : undefined;
  if (!lead) {
    lead = EMPTY_LEAD(input.id || randomUUID());
    leads.push(lead);
  }
  const set = (k: keyof Lead, v?: string) => {
    if (typeof v === "string" && v.trim()) (lead as any)[k] = v.trim();
  };
  set("name", input.name);
  set("phone", input.phone);
  set("city", input.city);
  set("budget", input.budget);
  set("fuel", input.fuel);
  set("transmission", input.transmission);
  set("timeline", input.timeline);
  set("exchange", input.exchange);
  set("finance", input.finance);
  if (input.interestedModels !== undefined) {
    const models = normalizeModels(input.interestedModels);
    if (models.length) lead.interestedModels = models;
  }
  lead.updatedAt = new Date().toISOString();
  saveLeads();
  return { ok: true as const, lead };
}

export function getLead(id: string): Lead | undefined {
  return leads.find((l) => l.id === id);
}

// ---- test-drive availability + booking ----
export function getAvailability(dealershipInput: string, date: string) {
  const dealership = resolveDealership(dealershipInput);
  if (!dealership) return { ok: false as const, error: "Unknown dealership." };
  if (!workingDays().some((d) => d.date === date)) {
    return { ok: false as const, error: "That date is not available in the next week." };
  }
  const taken = new Set(
    testdrives.filter((t) => t.dealershipId === dealership.id && t.date === date).map((t) => t.time)
  );
  const isToday = date === today();
  const cur = nowHHMM();
  const free = slotTimes().filter((t) => !taken.has(t) && (!isToday || t > cur));
  return { ok: true as const, dealership, date, available: free };
}

export function listTestDrives(date?: string) {
  const valid = new Set(workingDays().map((d) => d.date));
  return testdrives
    .filter((t) => valid.has(t.date) && (!date || t.date === date))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export interface BookInput {
  leadId?: string;
  dealership: string;
  carModel: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}

export function bookTestDrive(input: BookInput) {
  const dealership = resolveDealership(input.dealership);
  if (!dealership) return { ok: false as const, error: "Unknown dealership." };
  const model = normalizeModels(input.carModel)[0];
  if (!model) return { ok: false as const, error: "A car model is required." };
  if (!input.name?.trim()) return { ok: false as const, error: "A customer name is required." };
  if (!input.phone || (input.phone.match(/\d/g) || []).length < 7)
    return { ok: false as const, error: "A valid phone number is required." };
  if (!workingDays().some((d) => d.date === input.date))
    return { ok: false as const, error: "That date is not available in the next week." };
  if (!slotTimes().includes(input.time))
    return { ok: false as const, error: "That time is not a valid 30-minute slot." };
  if (input.date === today() && input.time <= nowHHMM())
    return { ok: false as const, error: "That time has already passed." };
  const clash = testdrives.find(
    (t) => t.dealershipId === dealership.id && t.date === input.date && t.time === input.time
  );
  if (clash) return { ok: false as const, error: "That slot is already booked." };

  // Link to / create the lead so the booking carries the enriched record.
  const leadRes = saveLead({
    id: input.leadId,
    name: input.name,
    phone: input.phone,
    interestedModels: model,
  });

  const td: TestDrive = {
    id: randomUUID(),
    leadId: leadRes.lead.id,
    dealershipId: dealership.id,
    carModel: model,
    date: input.date,
    time: input.time,
    name: input.name.trim(),
    phone: input.phone.trim(),
    createdAt: new Date().toISOString(),
  };
  testdrives.push(td);
  saveTestDrives();
  return { ok: true as const, testDrive: td, dealership, lead: leadRes.lead };
}
