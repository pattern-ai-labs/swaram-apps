export interface Day {
  date: string;
  label: string;
}
export interface SupportConfig {
  appliances: string[];
  requestTypes: string[];
  warranty: string[];
  areas: string[];
  timeBands: string[];
  timeBandsToday: string[];
  days: Day[];
  today: string;
}
export interface Ticket {
  id: string;
  ref: string;
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
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function getSupportConfig(): Promise<SupportConfig> {
  const r = await fetch("/api/support/config");
  if (!r.ok) throw new Error("Could not load customer care.");
  return r.json();
}

export async function getTickets(): Promise<Ticket[]> {
  const r = await fetch("/api/support/tickets");
  if (!r.ok) throw new Error("Could not load tickets.");
  return (await r.json()).tickets as Ticket[];
}

type RequestPayload = Partial<Omit<Ticket, "createdAt" | "updatedAt" | "ref" | "status">> & {
  id?: string;
};

export async function saveRequest(payload: RequestPayload): Promise<{ ok: boolean; ticket: Ticket }> {
  const r = await fetch("/api/support/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function scheduleRequest(
  payload: RequestPayload
): Promise<{ ok: boolean; ticket: Ticket; error?: string }> {
  const r = await fetch("/api/support/schedule", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

/** Modify an existing ticket (identity check: name + phone must match the ref). */
export async function updateTicket(payload: {
  ref: string;
  name: string;
  phone: string;
  appliance?: string;
  requestType?: string;
  issue?: string;
  warranty?: string;
  area?: string;
  address?: string;
  preferredDate?: string;
  preferredTime?: string;
}): Promise<{ ok: boolean; ticket?: Ticket; error?: string }> {
  const r = await fetch("/api/support/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

/** Cancel an existing ticket (identity check: name + phone must match the ref). */
export async function cancelTicket(payload: {
  ref: string;
  name: string;
  phone: string;
}): Promise<{ ok: boolean; ticket?: Ticket; error?: string }> {
  const r = await fetch("/api/support/cancel", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
