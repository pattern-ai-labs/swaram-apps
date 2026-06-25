import { Router } from "express";
import {
  getConfig,
  listBookings,
  getAvailability,
  book,
  cancel,
  DOCTORS,
} from "../clinic.js";

export const clinicRouter = Router();

/** Doctors, slot times, working days, today. */
clinicRouter.get("/config", (_req, res) => {
  res.json(getConfig());
});

/** Existing bookings (optionally for one date). Includes doctor name for display. */
clinicRouter.get("/bookings", (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const byId = Object.fromEntries(DOCTORS.map((d) => [d.id, d]));
  const rows = listBookings(date).map((b) => ({
    ...b,
    doctorName: byId[b.doctorId]?.name ?? b.doctorId,
  }));
  res.json({ bookings: rows });
});

/** Free slots for a doctor on a date. */
clinicRouter.get("/availability", (req, res) => {
  const doctor = String(req.query.doctor ?? "");
  const date = String(req.query.date ?? "");
  res.json(getAvailability(doctor, date));
});

/** Make a booking. */
clinicRouter.post("/book", (req, res) => {
  const { doctor, date, time, name, phone } = req.body ?? {};
  const result = book({
    doctor: String(doctor ?? ""),
    date: String(date ?? ""),
    time: String(time ?? ""),
    name: String(name ?? ""),
    phone: String(phone ?? ""),
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/** Cancel a booking — only if name + phone match the booking on record. */
clinicRouter.post("/cancel", (req, res) => {
  const { doctor, date, time, name, phone } = req.body ?? {};
  const result = cancel({
    doctor: String(doctor ?? ""),
    date: String(date ?? ""),
    time: String(time ?? ""),
    name: String(name ?? ""),
    phone: String(phone ?? ""),
  });
  res.status(result.ok ? 200 : 400).json(result);
});
