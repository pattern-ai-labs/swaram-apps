import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

/**
 * Subash Care — voice product registration.
 *
 * Unlike the booking demos there is no calendar/slot board: this is a progressive
 * free-text capture (customer + product details) that ends in a server-minted
 * registration id. The one closed set is the service selection (the gate) and the
 * customer's district (snapped to Kerala's 14 districts).
 */

// The three services the IVR offers; only Product Registration is actually handled.
export const SERVICES = [
  "Installation Registration",
  "Complaint Registration",
  "Product Registration",
];

// Kerala's 14 districts — canonical English spellings; the model snaps the spoken
// (Malayalam) district to one of these via the tool enum.
export const DISTRICTS = [
  "Thiruvananthapuram",
  "Kollam",
  "Pathanamthitta",
  "Alappuzha",
  "Kottayam",
  "Idukki",
  "Ernakulam",
  "Thrissur",
  "Palakkad",
  "Malappuram",
  "Kozhikode",
  "Wayanad",
  "Kannur",
  "Kasaragod",
];

/** Snap a spoken value to a canonical list entry (id/equality/contains both ways). */
function resolveFrom(list: string[], input?: string): string | undefined {
  if (!input) return undefined;
  const q = input.toLowerCase().trim();
  return (
    list.find((x) => x.toLowerCase() === q) ||
    list.find((x) => q.includes(x.toLowerCase())) ||
    list.find((x) => x.toLowerCase().includes(q))
  );
}

// ---- types ----
export interface Registration {
  id: string;
  ref: string; // SC-##### once completed
  service: string;
  // customer
  name: string;
  phone: string;
  address: string;
  district: string;
  pincode: string;
  // product
  productName: string;
  modelNumber: string;
  serialNumber: string;
  purchaseDate: string; // canonical "DD/MM/YYYY" (validated, never future)
  shopName: string;
  shopLocation: string;
  status: string; // "Draft" | "Registered"
  createdAt: string;
  updatedAt: string;
}

// ---- persistence ----
const DATA_DIR = fileURLToPath(new URL("../data/", import.meta.url));
const FILE = fileURLToPath(new URL("../data/subash-registrations.json", import.meta.url));
let registrations: Registration[] = [];

function save(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(registrations, null, 2));
}

export function loadRegistrations(): void {
  if (existsSync(FILE)) {
    try {
      registrations = JSON.parse(readFileSync(FILE, "utf8"));
    } catch {
      registrations = [];
    }
  }
}

/** A random 5-digit registration id, SC-#####, unique against existing refs. */
function nextRef(): string {
  const used = new Set(registrations.map((r) => r.ref));
  for (let i = 0; i < 50; i++) {
    const n = Math.floor(10000 + Math.random() * 90000); // 10000–99999
    const ref = `SC-${n}`;
    if (!used.has(ref)) return ref;
  }
  // Fallback (astronomically unlikely): widen the space.
  return `SC-${Date.now().toString().slice(-6)}`;
}

// ---- digit helpers (mobile / pincode validation) ----
function digits(s?: string): string {
  return (s || "").replace(/\D/g, "");
}
function validMobile(s?: string): boolean {
  const d = digits(s);
  return d.length === 10; // Indian mobile, 10 digits
}
function validPincode(s?: string): boolean {
  return digits(s).length === 6; // Indian PIN, 6 digits
}

/**
 * Parse a purchase date the model sends as "DD MM YYYY" (separators ignored).
 * Requires all three parts. A 2-digit year is read as the 2000s (26 -> 2026).
 * Must be a real calendar date and NOT in the future (today is allowed).
 * Returns a canonical "DD/MM/YYYY" on success, else a reason the agent can act on:
 *   "incomplete" (fewer than 3 parts) | "future" | "invalid".
 */
function parsePurchaseDate(input: string): { ok: boolean; reason?: string; value?: string } {
  const parts = input.match(/\d+/g) || [];
  if (parts.length < 3) return { ok: false, reason: "incomplete" };
  const [dStr, mStr, yStr] = parts;
  const d = Number(dStr);
  const m = Number(mStr);
  let y = Number(yStr);
  if (yStr.length === 2) y = 2000 + y; // all devices are 2000s — 26 -> 2026
  else if (yStr.length !== 4) return { ok: false, reason: "invalid" };
  if (d < 1 || d > 31 || m < 1 || m > 12) return { ok: false, reason: "invalid" };
  const dt = new Date(y, m - 1, d);
  // Round-trip check rejects impossible dates (e.g. 31/02).
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) {
    return { ok: false, reason: "invalid" };
  }
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (dt.getTime() > todayStart.getTime()) return { ok: false, reason: "future" };
  const value = `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`;
  return { ok: true, value };
}

// ---- config ----
export function getConfig() {
  return {
    services: SERVICES,
    districts: DISTRICTS,
    today: new Date().toISOString().slice(0, 10),
  };
}

// ---- registration upsert (progressive capture) ----
export interface RegistrationInput {
  id?: string;
  service?: string;
  name?: string;
  phone?: string;
  address?: string;
  district?: string;
  pincode?: string;
  productName?: string;
  modelNumber?: string;
  serialNumber?: string;
  purchaseDate?: string;
  shopName?: string;
  shopLocation?: string;
}

const EMPTY = (id: string): Registration => ({
  id,
  ref: "",
  service: "",
  name: "",
  phone: "",
  address: "",
  district: "",
  pincode: "",
  productName: "",
  modelNumber: "",
  serialNumber: "",
  purchaseDate: "",
  shopName: "",
  shopLocation: "",
  status: "Draft",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

/** Create or merge a registration. Only provided fields overwrite; others are kept. */
export function saveRegistration(input: RegistrationInput) {
  let r = input.id ? registrations.find((x) => x.id === input.id) : undefined;
  if (!r) {
    r = EMPTY(input.id || randomUUID());
    registrations.push(r);
  }
  const setRaw = (k: keyof Registration, v?: string) => {
    if (typeof v === "string" && v.trim()) (r as any)[k] = v.trim();
  };
  const setEnum = (k: keyof Registration, list: string[], v?: string) => {
    if (typeof v !== "string" || !v.trim()) return;
    (r as any)[k] = resolveFrom(list, v) ?? v.trim();
  };
  setEnum("service", SERVICES, input.service);
  setEnum("district", DISTRICTS, input.district);
  setRaw("name", input.name);
  setRaw("address", input.address);
  setRaw("productName", input.productName);
  setRaw("modelNumber", input.modelNumber);
  setRaw("serialNumber", input.serialNumber);
  setRaw("shopName", input.shopName);
  setRaw("shopLocation", input.shopLocation);
  // Numeric fields are stored digits-only so the card + validation stay clean.
  // Mobile: count the digits of THIS attempt (so the agent can guide the caller),
  // but only PERSIST a valid 10-digit number — a partial or over-long attempt is
  // not stored. phoneCheck is the verdict handed back to the agent (never the number).
  let phoneCheck: { ok: boolean; digits: number } | undefined;
  if (typeof input.phone === "string" && input.phone.trim()) {
    const d = digits(input.phone);
    phoneCheck = { ok: d.length === 10, digits: d.length };
    if (d.length === 10) r.phone = d;
  }
  // Pincode: same rule — count this attempt for feedback, but only persist a valid
  // 6-digit PIN. pincodeCheck is the verdict handed back to the agent.
  let pincodeCheck: { ok: boolean; digits: number } | undefined;
  if (typeof input.pincode === "string" && input.pincode.trim()) {
    const d = digits(input.pincode);
    pincodeCheck = { ok: d.length === 6, digits: d.length };
    if (d.length === 6) r.pincode = d;
  }
  // Purchase date: model sends "DD MM YYYY"; we validate (real date, not future)
  // and store a canonical "DD/MM/YYYY". dateCheck is the verdict for the agent.
  let dateCheck: { ok: boolean; reason?: string } | undefined;
  if (typeof input.purchaseDate === "string" && input.purchaseDate.trim()) {
    const res = parsePurchaseDate(input.purchaseDate);
    dateCheck = { ok: res.ok, reason: res.reason };
    if (res.ok && res.value) r.purchaseDate = res.value;
  }
  r.updatedAt = new Date().toISOString();
  save();
  return { ok: true as const, registration: r, phoneCheck, pincodeCheck, dateCheck };
}

export function getRegistration(id: string): Registration | undefined {
  return registrations.find((r) => r.id === id);
}

// ---- finalize ----
/**
 * Validate the core-required fields, then mint a registration id. Core set:
 * name, phone (valid 10-digit), product name, model number. Everything else is
 * captured if given but does not block the id (per the agreed flexibility).
 */
export function completeRegistration(input: RegistrationInput) {
  const merged = saveRegistration(input).registration;

  const missing: string[] = [];
  if (!merged.name) missing.push("name");
  if (!validMobile(merged.phone)) missing.push("a valid mobile number");
  if (!merged.productName) missing.push("product name");
  if (!merged.modelNumber) missing.push("model number");
  // Pincode is optional, but if given it must be a real 6-digit PIN.
  if (merged.pincode && !validPincode(merged.pincode)) missing.push("a valid pincode");
  if (missing.length) {
    return { ok: false as const, error: `Still need: ${missing.join(", ")}.`, registration: merged };
  }

  if (merged.status !== "Registered") {
    merged.service = merged.service || "Product Registration";
    merged.ref = nextRef();
    merged.status = "Registered";
    merged.updatedAt = new Date().toISOString();
    save();
  }
  return { ok: true as const, registration: merged };
}

/** Completed registrations, newest first (for the recent queue). */
export function listRegistrations(): Registration[] {
  return registrations
    .filter((r) => r.status === "Registered")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
