// Car model catalog. Only Maruti is bookable right now (it has the centres /
// dealerships below); the model list is what the voice agents recognize and read
// back. Attributes (body type, fuel, transmission, price band) let the sales
// advisor recommend and match a prospect's needs. Prices are approximate
// ex-showroom bands in Indian rupees, for demo purposes only.

export interface CarModel {
  name: string;
  bodyType: "Hatchback" | "Sedan" | "SUV" | "MPV" | "Van";
  fuel: string[]; // e.g. ["Petrol", "CNG"]
  transmission: string[]; // ["Manual", "Automatic"]
  priceBand: string; // e.g. "₹6–10 lakh"
  seats: number;
}

export interface Brand {
  id: string;
  name: string;
  models: CarModel[];
}

export const BRANDS: Brand[] = [
  {
    id: "maruti",
    name: "Maruti Suzuki",
    models: [
      { name: "Alto K10", bodyType: "Hatchback", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹4–6 lakh", seats: 5 },
      { name: "S-Presso", bodyType: "Hatchback", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹4–6.5 lakh", seats: 5 },
      { name: "Celerio", bodyType: "Hatchback", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹5.5–7 lakh", seats: 5 },
      { name: "WagonR", bodyType: "Hatchback", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹5.5–8 lakh", seats: 5 },
      { name: "Swift", bodyType: "Hatchback", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹6.5–9.5 lakh", seats: 5 },
      { name: "Dzire", bodyType: "Sedan", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹6.5–10 lakh", seats: 5 },
      { name: "Baleno", bodyType: "Hatchback", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹6.5–10 lakh", seats: 5 },
      { name: "Ignis", bodyType: "Hatchback", fuel: ["Petrol"], transmission: ["Manual", "Automatic"], priceBand: "₹6–8.5 lakh", seats: 5 },
      { name: "Fronx", bodyType: "SUV", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹7.5–13 lakh", seats: 5 },
      { name: "Brezza", bodyType: "SUV", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹8.5–14 lakh", seats: 5 },
      { name: "Ertiga", bodyType: "MPV", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹8.5–13.5 lakh", seats: 7 },
      { name: "XL6", bodyType: "MPV", fuel: ["Petrol", "CNG"], transmission: ["Manual", "Automatic"], priceBand: "₹11.5–15 lakh", seats: 6 },
      { name: "Ciaz", bodyType: "Sedan", fuel: ["Petrol"], transmission: ["Manual", "Automatic"], priceBand: "₹9.5–12.5 lakh", seats: 5 },
      { name: "Grand Vitara", bodyType: "SUV", fuel: ["Petrol", "CNG", "Hybrid"], transmission: ["Manual", "Automatic"], priceBand: "₹11–20 lakh", seats: 5 },
      { name: "Jimny", bodyType: "SUV", fuel: ["Petrol"], transmission: ["Manual", "Automatic"], priceBand: "₹12.5–15 lakh", seats: 4 },
      { name: "Eeco", bodyType: "Van", fuel: ["Petrol", "CNG"], transmission: ["Manual"], priceBand: "₹5.5–6.5 lakh", seats: 5 },
      { name: "Invicto", bodyType: "MPV", fuel: ["Petrol", "Hybrid"], transmission: ["Automatic"], priceBand: "₹25–29 lakh", seats: 7 },
    ],
  },
];

/** The brand that is currently bookable (has centres / dealerships). */
export const ACTIVE_BRAND_ID = "maruti";

export function activeBrand(): Brand {
  return BRANDS.find((b) => b.id === ACTIVE_BRAND_ID) ?? BRANDS[0];
}

/** Just the model names for the active brand (used for enum constraints / matching). */
export function modelNames(): string[] {
  return activeBrand().models.map((m) => m.name);
}
