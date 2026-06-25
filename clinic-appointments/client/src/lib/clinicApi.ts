export interface Doctor {
  id: string;
  name: string;
  specialty: string;
}
export interface Day {
  date: string;
  label: string;
}
export interface ClinicConfig {
  doctors: Doctor[];
  slots: string[];
  days: Day[];
  today: string;
  hours: string;
}
export interface Booking {
  id: string;
  doctorId: string;
  doctorName: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}

export async function getClinicConfig(): Promise<ClinicConfig> {
  const r = await fetch("/api/clinic/config");
  if (!r.ok) throw new Error("Could not load the clinic.");
  return r.json();
}

export async function getBookings(): Promise<Booking[]> {
  const r = await fetch("/api/clinic/bookings");
  if (!r.ok) throw new Error("Could not load bookings.");
  return (await r.json()).bookings as Booking[];
}

export async function checkAvailability(doctor: string, date: string) {
  const r = await fetch(
    `/api/clinic/availability?doctor=${encodeURIComponent(doctor)}&date=${encodeURIComponent(date)}`
  );
  return r.json();
}

export async function bookAppointment(payload: {
  doctor: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}) {
  const r = await fetch("/api/clinic/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function cancelAppointment(payload: {
  doctor: string;
  date: string;
  time: string;
  name: string;
  phone: string;
}) {
  const r = await fetch("/api/clinic/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
