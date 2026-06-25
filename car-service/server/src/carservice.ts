import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { BRANDS, activeBrand, modelNames } from "./carCatalog.js";

export interface Centre {
  id: string;
  name: string; // display name, e.g. "Kakkanad"
  area: string; // full area label
}

export interface ServiceBooking {
  id: string;
  centreId: string;
  carModel: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  works: string; // free-text notes; "" = general service
  name: string;
  phone: string;
  createdAt: string;
}

// Maruti service centres around Kochi.
export const CENTRES: Centre[] = [
  { id: "kakkanad", name: "Kakkanad", area: "Kakkanad" },
  { id: "thripunithura", name: "Thripunithura", area: "Thripunithura" },
  { id: "edapally", name: "Edapally", area: "Edapally" },
  { id: "ernakulam", name: "Ernakulam", area: "Ernakulam (M.G. Road)" },
];

const HOURS: [string, string][] = [
  ["09:00", "13:00"],
  ["14:00", "17:00"],
];
const WINDOW_DAYS = 7; // calendar days from today (Sundays skipped)

/** All 30-minute slot start times for a day. */
export function slotTimes(): string[] {
  const out: string[] = [];
  for (const [start, end] of HOURS) {
    let [h, m] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    while (h < eh || (h === eh && m < em)) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += 30;
      if (m >= 60) {
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
  label: string; // e.g. "Tue 24 Jun"
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
      label: d.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      }),
    });
  }
  return days;
}

export function today(): string {
  return fmt(new Date());
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function resolveCentre(input: string): Centre | null {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  return (
    CENTRES.find((c) => c.id === q) ||
    CENTRES.find((c) => c.name.toLowerCase() === q) ||
    CENTRES.find((c) => q.includes(c.name.toLowerCase())) ||
    CENTRES.find((c) => c.name.toLowerCase().includes(q)) ||
    null
  );
}

/** Best-effort match of a spoken model to the active brand's catalogue. */
export function resolveModel(input: string): string | null {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  const models = modelNames();
  return (
    models.find((m) => m.toLowerCase() === q) ||
    models.find((m) => q.includes(m.toLowerCase())) ||
    models.find((m) => m.toLowerCase().includes(q)) ||
    null
  );
}

// ---- persistence ----
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const FILE = fileURLToPath(new URL("../data/service-bookings.json", import.meta.url));
let bookings: ServiceBooking[] = [];

function save(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(bookings, null, 2));
}

function seed(): ServiceBooking[] {
  const days = workingDays();
  const pick = (i: number) => days[Math.min(i, days.length - 1)]?.date ?? today();
  const mk = (
    centreId: string,
    date: string,
    time: string,
    carModel: string,
    works: string,
    name: string,
    phone: string
  ): ServiceBooking => ({
    id: randomUUID(),
    centreId,
    carModel,
    date,
    time,
    works,
    name,
    phone,
    createdAt: new Date().toISOString(),
  });
  return [
    mk("kakkanad", pick(0), "09:30", "Swift", "Periodic service, brake check", "Anand Kumar", "9000000001"),
    mk("kakkanad", pick(0), "11:00", "Baleno", "AC not cooling", "Fathima Rashid", "9000000002"),
    mk("edapally", pick(1), "10:00", "Brezza", "General service", "Lakshmi Pillai", "9000000003"),
    mk("ernakulam", pick(2), "14:30", "Dzire", "Oil change, wheel alignment", "Joseph Thomas", "9000000004"),
    mk("thripunithura", pick(3), "15:00", "WagonR", "Clutch noise", "Sneha Varma", "9000000005"),
  ];
}

export function loadServiceBookings(): void {
  if (existsSync(FILE)) {
    try {
      bookings = JSON.parse(readFileSync(FILE, "utf8"));
      return;
    } catch {
      /* fall through to seed */
    }
  }
  bookings = seed();
  save();
}

// ---- queries ----
export function getConfig() {
  const brand = activeBrand();
  return {
    brand: { id: brand.id, name: brand.name },
    models: modelNames(),
    brands: BRANDS.map((b) => ({ id: b.id, name: b.name, models: b.models.map((m) => m.name) })),
    centres: CENTRES,
    slots: slotTimes(),
    days: workingDays(),
    today: today(),
    hours: "9:00–13:00, 14:00–17:00",
  };
}

/** All bookings within the visible window. */
export function listBookings(date?: string): ServiceBooking[] {
  const valid = new Set(workingDays().map((d) => d.date));
  return bookings
    .filter((b) => valid.has(b.date) && (!date || b.date === date))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function getAvailability(centreInput: string, date: string) {
  const centre = resolveCentre(centreInput);
  if (!centre) return { ok: false as const, error: "Unknown service centre." };
  const days = workingDays();
  if (!days.some((d) => d.date === date)) {
    return { ok: false as const, error: "That date is not a working day in the next week." };
  }
  const taken = new Set(
    bookings.filter((b) => b.centreId === centre.id && b.date === date).map((b) => b.time)
  );
  const isToday = date === today();
  const cur = nowHHMM();
  const free = slotTimes().filter((t) => !taken.has(t) && (!isToday || t > cur));
  return { ok: true as const, centre, date, available: free };
}

export interface BookInput {
  centre: string;
  carModel: string;
  date: string;
  time: string;
  works?: string;
  name: string;
  phone: string;
}

export function book(input: BookInput) {
  const centre = resolveCentre(input.centre);
  if (!centre) return { ok: false as const, error: "Unknown service centre." };
  const model = resolveModel(input.carModel) ?? input.carModel?.trim();
  if (!model) return { ok: false as const, error: "A car model is required." };
  if (!input.name?.trim()) return { ok: false as const, error: "A customer name is required." };
  if (!input.phone || (input.phone.match(/\d/g) || []).length < 7)
    return { ok: false as const, error: "A valid phone number is required." };
  if (!workingDays().some((d) => d.date === input.date))
    return { ok: false as const, error: "That date is not a working day in the next week." };
  if (!slotTimes().includes(input.time))
    return { ok: false as const, error: "That time is not a valid 30-minute slot." };
  if (input.date === today() && input.time <= nowHHMM())
    return { ok: false as const, error: "That time has already passed." };
  const clash = bookings.find(
    (b) => b.centreId === centre.id && b.date === input.date && b.time === input.time
  );
  if (clash) return { ok: false as const, error: "That slot is already booked." };

  const booking: ServiceBooking = {
    id: randomUUID(),
    centreId: centre.id,
    carModel: model,
    date: input.date,
    time: input.time,
    works: (input.works ?? "").trim(),
    name: input.name.trim(),
    phone: input.phone.trim(),
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  save();
  return { ok: true as const, booking, centre };
}
