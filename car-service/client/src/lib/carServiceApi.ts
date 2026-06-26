export interface Centre {
  id: string;
  name: string;
  area: string;
}
export interface Day {
  date: string;
  label: string;
}
export interface CarServiceConfig {
  brand: { id: string; name: string };
  models: string[];
  centres: Centre[];
  slots: string[];
  days: Day[];
  today: string;
  hoursLabel: string; // e.g. "9:00–13:00, 14:00–17:00"
  daysLabel: string; // e.g. "Mon–Sat"
}
export interface ServiceBooking {
  id: string;
  centreId: string;
  centreName: string;
  carModel: string;
  date: string;
  time: string;
  works: string;
  name: string;
  phone: string;
}

export async function getCarServiceConfig(): Promise<CarServiceConfig> {
  const r = await fetch("/api/carservice/config");
  if (!r.ok) throw new Error("Could not load the service centre.");
  return r.json();
}

export async function getBookings(): Promise<ServiceBooking[]> {
  const r = await fetch("/api/carservice/bookings");
  if (!r.ok) throw new Error("Could not load bookings.");
  return (await r.json()).bookings as ServiceBooking[];
}

export async function checkAvailability(centre: string, date: string) {
  const r = await fetch(
    `/api/carservice/availability?centre=${encodeURIComponent(centre)}&date=${encodeURIComponent(date)}`
  );
  return r.json();
}

export async function bookService(payload: {
  centre: string;
  carModel: string;
  date: string;
  time: string;
  works: string;
  name: string;
  phone: string;
}) {
  const r = await fetch("/api/carservice/book", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
