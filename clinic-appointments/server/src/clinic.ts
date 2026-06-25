import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
}

export interface Booking {
  id: string;
  doctorId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  name: string;
  phone: string;
  createdAt: string;
}

export const DOCTORS: Doctor[] = [
  { id: "dr-meera", name: "Dr. Meera Nair", specialty: "General Medicine" },
  { id: "dr-rajeev", name: "Dr. Rajeev Menon", specialty: "Pediatrics" },
];

const HOURS: [string, string][] = [
  ["09:00", "13:00"],
  ["14:00", "17:00"],
];
const WINDOW_DAYS = 14; // calendar days from today (Sundays skipped)

/** All 30-minute slot start times for a day, e.g. 09:00 … 12:30, 14:00 … 16:30 */
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

export function resolveDoctor(input: string): Doctor | null {
  if (!input) return null;
  const q = input.toLowerCase().trim();
  return (
    DOCTORS.find((d) => d.id === q) ||
    DOCTORS.find((d) => d.name.toLowerCase() === q) ||
    DOCTORS.find((d) => q.includes(d.name.toLowerCase().replace("dr. ", ""))) ||
    DOCTORS.find((d) => d.name.toLowerCase().split(" ").some((p) => p.length > 2 && q.includes(p))) ||
    DOCTORS.find((d) => q.includes(d.specialty.toLowerCase().split(" ")[0])) ||
    null
  );
}

// ---- persistence ----
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const FILE = fileURLToPath(new URL("../data/bookings.json", import.meta.url));
let bookings: Booking[] = [];

function save(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(bookings, null, 2));
}

function seed(): Booking[] {
  const days = workingDays();
  const pick = (i: number) => days[Math.min(i, days.length - 1)]?.date ?? today();
  const mk = (
    doctorId: string,
    date: string,
    time: string,
    name: string,
    phone: string
  ): Booking => ({ id: randomUUID(), doctorId, date, time, name, phone, createdAt: new Date().toISOString() });
  return [
    mk("dr-meera", pick(0), "10:00", "Anand Kumar", "9000000001"),
    mk("dr-meera", pick(0), "11:30", "Fathima Rashid", "9000000002"),
    mk("dr-rajeev", pick(1), "09:30", "Lakshmi Pillai", "9000000003"),
    mk("dr-rajeev", pick(2), "15:00", "Joseph Thomas", "9000000004"),
    mk("dr-meera", pick(3), "14:30", "Sneha Varma", "9000000005"),
  ];
}

export function loadBookings(): void {
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
  return {
    doctors: DOCTORS,
    slots: slotTimes(),
    days: workingDays(),
    today: today(),
    hours: "9:00–13:00, 14:00–17:00",
  };
}

/** All bookings within the visible window. */
export function listBookings(date?: string): Booking[] {
  const valid = new Set(workingDays().map((d) => d.date));
  return bookings
    .filter((b) => valid.has(b.date) && (!date || b.date === date))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

export function getAvailability(doctorInput: string, date: string) {
  const doctor = resolveDoctor(doctorInput);
  if (!doctor) return { ok: false as const, error: "Unknown doctor." };
  const days = workingDays();
  if (!days.some((d) => d.date === date)) {
    return { ok: false as const, error: "That date is not a working day in the next two weeks." };
  }
  const taken = new Set(
    bookings.filter((b) => b.doctorId === doctor.id && b.date === date).map((b) => b.time)
  );
  const isToday = date === today();
  const cur = nowHHMM();
  const free = slotTimes().filter((t) => !taken.has(t) && (!isToday || t > cur));
  return { ok: true as const, doctor, date, available: free };
}

export interface BookInput {
  doctor: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}

export function book(input: BookInput) {
  const doctor = resolveDoctor(input.doctor);
  if (!doctor) return { ok: false as const, error: "Unknown doctor." };
  if (!input.name?.trim()) return { ok: false as const, error: "A patient name is required." };
  if (!input.phone || (input.phone.match(/\d/g) || []).length < 7)
    return { ok: false as const, error: "A valid phone number is required." };
  if (!workingDays().some((d) => d.date === input.date))
    return { ok: false as const, error: "That date is not a working day in the next two weeks." };
  if (!slotTimes().includes(input.time))
    return { ok: false as const, error: "That time is not a valid 30-minute slot." };
  if (input.date === today() && input.time <= nowHHMM())
    return { ok: false as const, error: "That time has already passed." };
  const clash = bookings.find(
    (b) => b.doctorId === doctor.id && b.date === input.date && b.time === input.time
  );
  if (clash) return { ok: false as const, error: "That slot is already booked." };

  const booking: Booking = {
    id: randomUUID(),
    doctorId: doctor.id,
    date: input.date,
    time: input.time,
    name: input.name.trim(),
    phone: input.phone.trim(),
    createdAt: new Date().toISOString(),
  };
  bookings.push(booking);
  save();
  return { ok: true as const, booking, doctor };
}

// ---- cancellation (with a name + phone identity check) ----
function normName(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}
/** Last 10 digits, so country code / spacing / punctuation don't matter. */
function last10(s: string): string {
  const d = (s || "").replace(/\D/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}

export interface CancelInput {
  doctor: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}

/**
 * Cancel the appointment at (doctor, date, time) — but ONLY if the supplied
 * name AND phone match the booking on record. The name/phone are the identity
 * check that the caller is the person who booked. On a mismatch we refuse and
 * never reveal the stored details.
 */
export function cancel(input: CancelInput) {
  const doctor = resolveDoctor(input.doctor);
  if (!doctor) return { ok: false as const, error: "Unknown doctor." };

  const idx = bookings.findIndex(
    (b) => b.doctorId === doctor.id && b.date === input.date && b.time === input.time
  );
  if (idx === -1) {
    return { ok: false as const, error: "No appointment found for that doctor at that date and time." };
  }

  const b = bookings[idx];
  const nameOk = normName(b.name) === normName(input.name);
  const phoneOk = last10(input.phone).length >= 7 && last10(b.phone) === last10(input.phone);
  if (!nameOk || !phoneOk) {
    // Do not disclose the stored name/phone — just refuse.
    return {
      ok: false as const,
      error: "The name and phone do not match this booking, so it cannot be cancelled.",
    };
  }

  const [cancelled] = bookings.splice(idx, 1);
  save();
  return { ok: true as const, cancelled, doctor };
}
