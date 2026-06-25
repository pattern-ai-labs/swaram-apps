import { Router } from "express";
import {
  getConfig,
  listBookings,
  getAvailability,
  book,
  CENTRES,
} from "../carservice.js";

export const carServiceRouter = Router();

/** Brand, models, centres, slot times, working days, today. */
carServiceRouter.get("/config", (_req, res) => {
  res.json(getConfig());
});

/** Existing bookings (optionally for one date). Includes centre name for display. */
carServiceRouter.get("/bookings", (req, res) => {
  const date = typeof req.query.date === "string" ? req.query.date : undefined;
  const byId = Object.fromEntries(CENTRES.map((c) => [c.id, c]));
  const rows = listBookings(date).map((b) => ({
    ...b,
    centreName: byId[b.centreId]?.name ?? b.centreId,
  }));
  res.json({ bookings: rows });
});

/** Free slots for a centre on a date. */
carServiceRouter.get("/availability", (req, res) => {
  const centre = String(req.query.centre ?? "");
  const date = String(req.query.date ?? "");
  res.json(getAvailability(centre, date));
});

/** Make a booking. */
carServiceRouter.post("/book", (req, res) => {
  const { centre, carModel, date, time, works, name, phone } = req.body ?? {};
  const result = book({
    centre: String(centre ?? ""),
    carModel: String(carModel ?? ""),
    date: String(date ?? ""),
    time: String(time ?? ""),
    works: String(works ?? ""),
    name: String(name ?? ""),
    phone: String(phone ?? ""),
  });
  res.status(result.ok ? 200 : 400).json(result);
});
