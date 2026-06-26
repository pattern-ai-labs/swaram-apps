import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { nameMatches, phoneMatches } from "./identity.js";

export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  /** Weekdays this doctor holds clinic, e.g. ["Mon","Wed","Fri","Sat"]. */
  workingDays: string[];
  /** This doctor's clinic windows, e.g. [["09:00","13:00"],["14:00","17:00"]]. */
  hours: [string, string][];
}

/** Editable clinic configuration (operator-editable JSON; see clinic-config.json). */
export interface ClinicConfigFile {
  windowDays: number;
  slotMinutes: number;
  doctors: Doctor[];
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export interface Booking {
  id: string;
  doctorId: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM (24h)
  name: string;
  phone: string;
  createdAt: string;
}

/** Built-in defaults; written to clinic-config.json on first run, then operator-editable.
 *  Each doctor carries their OWN working days and clinic hours (deliberately different
 *  here so per-doctor availability is visible out of the box). */
const DEFAULT_CONFIG: ClinicConfigFile = {
  windowDays: 14,
  slotMinutes: 30,
  doctors: [
    {
      id: "dr-meera",
      name: "Dr. Meera Nair",
      specialty: "General Medicine",
      workingDays: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      hours: [["09:00", "13:00"], ["14:00", "17:00"]],
    },
    {
      id: "dr-rajeev",
      name: "Dr. Rajeev Menon",
      specialty: "Pediatrics",
      workingDays: ["Mon", "Wed", "Fri", "Sat"],
      hours: [["10:00", "13:00"], ["15:00", "18:00"]],
    },
  ],
};

let config: ClinicConfigFile = DEFAULT_CONFIG;

/** Doctors from the live (operator-editable) config. A live `let` binding, so it
 *  reflects whatever loadClinic() read from clinic-config.json. */
export let DOCTORS: Doctor[] = config.doctors;

/** 30-minute slot starts within a set of [start,end] windows. */
export function slotTimesForHours(
  hours: [string, string][],
  stepMin: number = config.slotMinutes
): string[] {
  const out: string[] = [];
  for (const [start, end] of hours) {
    let [h, m] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);
    while (h < eh || (h === eh && m < em)) {
      out.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
      m += stepMin;
      while (m >= 60) {
        m -= 60;
        h += 1;
      }
    }
  }
  return out;
}

/** One doctor's own slot starts (from their hours). */
export function slotsFor(doctor: Doctor): string[] {
  return slotTimesForHours(doctor.hours);
}

/** The union of every doctor's slots — the superset used as the tool `time` enum. */
export function slotTimes(): string[] {
  const set = new Set<string>();
  for (const d of config.doctors) for (const t of slotsFor(d)) set.add(t);
  return [...set].sort();
}

function weekdayOf(dateStr: string): string {
  return WEEKDAYS[new Date(`${dateStr}T00:00:00`).getDay()];
}

/** Does this doctor hold clinic on the given date's weekday? */
export function doctorWorksOn(doctor: Doctor, dateStr: string): boolean {
  return doctor.workingDays.includes(weekdayOf(dateStr));
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

/** Bookable days within the window: every date on which AT LEAST ONE doctor holds
 *  clinic (union of all doctors' working weekdays). */
export function workingDays(): Day[] {
  const days: Day[] = [];
  const open = new Set(config.doctors.flatMap((d) => d.workingDays));
  const today = new Date();
  for (let i = 0; i < config.windowDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (!open.has(WEEKDAYS[d.getDay()])) continue; // no doctor works this weekday
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

/** "Mon–Sat" when the working days are one contiguous run, else "Mon, Wed, Fri". */
export function daysLabel(workingDays: string[]): string {
  const idx = workingDays
    .map((w) => WEEKDAYS.indexOf(w as (typeof WEEKDAYS)[number]))
    .sort((a, b) => a - b);
  const contiguous = idx.every((n, i) => i === 0 || n === idx[i - 1] + 1);
  if (contiguous && idx.length > 2) return `${WEEKDAYS[idx[0]]}–${WEEKDAYS[idx[idx.length - 1]]}`;
  return idx.map((n) => WEEKDAYS[n]).join(", ");
}

/** "9:00–13:00, 15:00–18:00" from a doctor's hour windows (no leading zero on hour). */
export function hoursLabel(hours: [string, string][]): string {
  const trim = (t: string) => t.replace(/^0/, "");
  return hours.map(([s, e]) => `${trim(s)}–${trim(e)}`).join(", ");
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
const CONFIG_FILE = fileURLToPath(new URL("../data/clinic-config.json", import.meta.url));
let bookings: Booking[] = [];

function save(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(bookings, null, 2));
}

/** Load the operator-editable clinic config (doctors + their days/hours). On first
 *  run it writes the defaults to clinic-config.json; after that an operator can edit
 *  that file (and restart) to change each doctor's availability. */
export function loadConfig(): void {
  if (existsSync(CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as ClinicConfigFile;
      if (parsed?.doctors?.length) {
        config = {
          windowDays: parsed.windowDays || DEFAULT_CONFIG.windowDays,
          slotMinutes: parsed.slotMinutes || DEFAULT_CONFIG.slotMinutes,
          doctors: parsed.doctors,
        };
        DOCTORS = config.doctors;
        return;
      }
    } catch {
      /* fall through to defaults */
    }
  }
  config = DEFAULT_CONFIG;
  DOCTORS = config.doctors;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
}

function seed(): Booking[] {
  const mk = (doctorId: string, date: string, time: string, name: string, phone: string): Booking => ({
    id: randomUUID(),
    doctorId,
    date,
    time,
    name,
    phone,
    createdAt: new Date().toISOString(),
  });
  // Place each sample on a date the doctor actually works, at a real slot of theirs.
  const datesFor = (doc: Doctor) => workingDays().filter((d) => doctorWorksOn(doc, d.date)).map((d) => d.date);
  const out: Booking[] = [];
  const samples: { doctorId: string; dayIdx: number; slotIdx: number; name: string; phone: string }[] = [
    { doctorId: "dr-meera", dayIdx: 0, slotIdx: 2, name: "Anand Kumar", phone: "9000000001" },
    { doctorId: "dr-meera", dayIdx: 0, slotIdx: 5, name: "Fathima Rashid", phone: "9000000002" },
    { doctorId: "dr-rajeev", dayIdx: 0, slotIdx: 0, name: "Lakshmi Pillai", phone: "9000000003" },
    { doctorId: "dr-rajeev", dayIdx: 1, slotIdx: 6, name: "Joseph Thomas", phone: "9000000004" },
    { doctorId: "dr-meera", dayIdx: 2, slotIdx: 10, name: "Sneha Varma", phone: "9000000005" },
  ];
  for (const s of samples) {
    const doc = config.doctors.find((d) => d.id === s.doctorId);
    if (!doc) continue;
    const dates = datesFor(doc);
    const slots = slotsFor(doc);
    const date = dates[Math.min(s.dayIdx, dates.length - 1)];
    const time = slots[Math.min(s.slotIdx, slots.length - 1)];
    if (date && time) out.push(mk(doc.id, date, time, s.name, s.phone));
  }
  return out;
}

export function loadBookings(): void {
  loadConfig();
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
    // Each doctor carries their own days/hours plus the derived per-doctor slot list
    // and human labels (so the UI and agent prompt never drift from the real hours).
    doctors: config.doctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialty: d.specialty,
      workingDays: d.workingDays,
      hours: d.hours,
      slots: slotsFor(d),
      hoursLabel: hoursLabel(d.hours),
      daysLabel: daysLabel(d.workingDays),
    })),
    slots: slotTimes(), // superset of all doctors' slots — the tool `time` enum
    days: workingDays(),
    today: today(),
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
  if (!doctorWorksOn(doctor, date)) {
    return {
      ok: false as const,
      doctor,
      date,
      available: [],
      error: `${doctor.name} does not have clinic that day. Days: ${daysLabel(doctor.workingDays)}.`,
    };
  }
  const taken = new Set(
    bookings.filter((b) => b.doctorId === doctor.id && b.date === date).map((b) => b.time)
  );
  const isToday = date === today();
  const cur = nowHHMM();
  // This doctor's OWN slots only, minus taken and (today) past slots.
  const free = slotsFor(doctor).filter((t) => !taken.has(t) && (!isToday || t > cur));
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
  if (!doctorWorksOn(doctor, input.date))
    return {
      ok: false as const,
      error: `${doctor.name} does not have clinic that day (${daysLabel(doctor.workingDays)} only).`,
    };
  if (!slotsFor(doctor).includes(input.time))
    return {
      ok: false as const,
      error: `That time is not within ${doctor.name}'s hours (${hoursLabel(doctor.hours)}).`,
    };
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

// ---- cancellation (with a name + phone identity check: strict phone, lenient name) ----
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
  const nameOk = nameMatches(b.name, input.name);
  const phoneOk = phoneMatches(b.phone, input.phone);
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
