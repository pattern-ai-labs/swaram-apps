import { Router } from "express";
import {
  getConfig,
  saveLead,
  getLead,
  getAvailability,
  listTestDrives,
  bookTestDrive,
  DEALERSHIPS,
} from "../testdrive.js";

export const testdriveRouter = Router();

/** Brand, models (with attributes), dealerships, slots, days, today, enrichment value sets. */
testdriveRouter.get("/config", (_req, res) => {
  res.json(getConfig());
});

/** Create or merge a lead (enrichment). Returns the merged lead. */
testdriveRouter.post("/lead", (req, res) => {
  const b = req.body ?? {};
  const result = saveLead({
    id: b.id,
    name: b.name,
    phone: b.phone,
    city: b.city,
    interestedModels: b.interestedModels,
    budget: b.budget,
    fuel: b.fuel,
    transmission: b.transmission,
    timeline: b.timeline,
    exchange: b.exchange,
    finance: b.finance,
  });
  res.json(result);
});

/** Fetch a single lead. */
testdriveRouter.get("/lead/:id", (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: "Lead not found." });
  res.json({ ok: true, lead });
});

/** Free test-drive slots for a dealership on a date. */
testdriveRouter.get("/availability", (req, res) => {
  const dealership = String(req.query.dealership ?? "");
  const date = String(req.query.date ?? "");
  res.json(getAvailability(dealership, date));
});

/** Existing test-drive bookings. Includes dealership name for display. */
testdriveRouter.get("/bookings", (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const byId = Object.fromEntries(DEALERSHIPS.map((d) => [d.id, d]));
  const rows = listTestDrives(date).map((t) => ({
    ...t,
    dealershipName: byId[t.dealershipId]?.name ?? t.dealershipId,
  }));
  res.json({ bookings: rows });
});

/** Book a test drive. */
testdriveRouter.post("/book", (req, res) => {
  const { leadId, dealership, carModel, date, time, name, phone } = req.body ?? {};
  const result = bookTestDrive({
    leadId: leadId ? String(leadId) : undefined,
    dealership: String(dealership ?? ""),
    carModel: String(carModel ?? ""),
    date: String(date ?? ""),
    time: String(time ?? ""),
    name: String(name ?? ""),
    phone: String(phone ?? ""),
  });
  res.status(result.ok ? 200 : 400).json(result);
});
