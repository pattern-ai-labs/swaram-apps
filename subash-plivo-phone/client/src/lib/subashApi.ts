export interface SubashConfig {
  services: string[];
  districts: string[];
  today: string;
}

export interface Registration {
  id: string;
  ref: string;
  service: string;
  name: string;
  phone: string;
  address: string;
  district: string;
  pincode: string;
  productName: string;
  modelNumber: string;
  serialNumber: string;
  purchaseDate: string;
  shopName: string;
  shopLocation: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export async function getSubashConfig(): Promise<SubashConfig> {
  const r = await fetch("/api/subash/config");
  if (!r.ok) throw new Error("Could not load product registration.");
  return r.json();
}

export async function getRegistrations(): Promise<Registration[]> {
  const r = await fetch("/api/subash/registrations");
  if (!r.ok) throw new Error("Could not load registrations.");
  return (await r.json()).registrations as Registration[];
}

type RegistrationPayload = Partial<
  Omit<Registration, "createdAt" | "updatedAt" | "ref" | "status">
> & { id?: string };

export async function saveRegistration(
  payload: RegistrationPayload
): Promise<{
  ok: boolean;
  registration: Registration;
  phoneCheck?: { ok: boolean; digits: number };
  pincodeCheck?: { ok: boolean; digits: number };
  dateCheck?: { ok: boolean; reason?: string };
}> {
  const r = await fetch("/api/subash/registration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function completeRegistration(
  payload: RegistrationPayload
): Promise<{ ok: boolean; registration: Registration; error?: string }> {
  const r = await fetch("/api/subash/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}
