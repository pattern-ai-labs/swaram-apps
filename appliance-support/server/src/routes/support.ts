import { Router } from "express";
import {
  getConfig,
  saveRequest,
  scheduleRequest,
  updateTicket,
  cancelTicket,
  getTicket,
  listTickets,
} from "../support.js";

export const supportRouter = Router();

/** Appliances, request types, areas, time bands, dates, warranty options. */
supportRouter.get("/config", (_req, res) => {
  res.json(getConfig());
});

/** Create or merge a draft ticket (progressive capture). Returns the merged ticket. */
supportRouter.post("/request", (req, res) => {
  const b = req.body ?? {};
  res.json(
    saveRequest({
      id: b.id,
      appliance: b.appliance,
      requestType: b.requestType,
      issue: b.issue,
      warranty: b.warranty,
      area: b.area,
      address: b.address,
      preferredDate: b.preferredDate,
      preferredTime: b.preferredTime,
      name: b.name,
      phone: b.phone,
    })
  );
});

/** Validate required fields and finalize the ticket (assigns a ref + Scheduled). */
supportRouter.post("/schedule", (req, res) => {
  const b = req.body ?? {};
  const result = scheduleRequest({
    id: b.id,
    appliance: b.appliance,
    requestType: b.requestType,
    issue: b.issue,
    warranty: b.warranty,
    area: b.area,
    address: b.address,
    preferredDate: b.preferredDate,
    preferredTime: b.preferredTime,
    name: b.name,
    phone: b.phone,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/** Modify an existing ticket — only if the name + phone match it (identity check). */
supportRouter.post("/update", (req, res) => {
  const b = req.body ?? {};
  const result = updateTicket({
    ref: String(b.ref ?? ""),
    name: String(b.name ?? ""),
    phone: String(b.phone ?? ""),
    appliance: b.appliance,
    requestType: b.requestType,
    issue: b.issue,
    warranty: b.warranty,
    area: b.area,
    address: b.address,
    preferredDate: b.preferredDate,
    preferredTime: b.preferredTime,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/** Cancel an existing ticket — only if the name + phone match it (identity check). */
supportRouter.post("/cancel", (req, res) => {
  const b = req.body ?? {};
  const result = cancelTicket({
    ref: String(b.ref ?? ""),
    name: String(b.name ?? ""),
    phone: String(b.phone ?? ""),
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/** Fetch a single ticket. */
supportRouter.get("/ticket/:id", (req, res) => {
  const ticket = getTicket(req.params.id);
  if (!ticket) return res.status(404).json({ ok: false, error: "Ticket not found." });
  res.json({ ok: true, ticket });
});

/** Recently scheduled tickets (for the queue). */
supportRouter.get("/tickets", (_req, res) => {
  res.json({ tickets: listTickets() });
});
