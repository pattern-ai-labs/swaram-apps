export interface Dealership {
  id: string;
  name: string;
  area: string;
}
export interface CarModel {
  name: string;
  bodyType: string;
  fuel: string[];
  transmission: string[];
  priceBand: string;
  seats: number;
}
export interface Day {
  date: string;
  label: string;
}
export interface EnrichSets {
  budget: string[];
  fuel: string[];
  transmission: string[];
  timeline: string[];
  finance: string[];
}
export interface TestDriveConfig {
  brand: { id: string; name: string };
  models: CarModel[];
  modelNames: string[];
  dealerships: Dealership[];
  slots: string[];
  days: Day[];
  today: string;
  hoursLabel: string; // e.g. "9:00–13:00, 14:00–17:00"
  daysLabel: string; // e.g. "Mon–Sat"
  enrich: EnrichSets;
}
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
  exchange: string;
  finance: string;
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
}
export interface TestDriveBooking extends TestDrive {
  dealershipName: string;
}

export async function getTestDriveConfig(): Promise<TestDriveConfig> {
  const r = await fetch("/api/testdrive/config");
  if (!r.ok) throw new Error("Could not load the dealership.");
  return r.json();
}

export async function saveLead(
  payload: Partial<Omit<Lead, "createdAt" | "updatedAt">> & { id?: string }
): Promise<{ ok: boolean; lead: Lead }> {
  const r = await fetch("/api/testdrive/lead", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function checkAvailability(dealership: string, date: string) {
  const r = await fetch(
    `/api/testdrive/availability?dealership=${encodeURIComponent(dealership)}&date=${encodeURIComponent(date)}`
  );
  return r.json();
}

export async function bookTestDrive(payload: {
  leadId?: string;
  dealership: string;
  carModel: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}) {
  const r = await fetch("/api/testdrive/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function getTestDriveBookings(): Promise<TestDriveBooking[]> {
  const r = await fetch("/api/testdrive/bookings");
  if (!r.ok) throw new Error("Could not load bookings.");
  return (await r.json()).bookings as TestDriveBooking[];
}
