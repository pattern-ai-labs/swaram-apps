import { Router } from "express";
import {
  getConfig,
  saveRegistration,
  completeRegistration,
  getRegistration,
  listRegistrations,
} from "../subash.js";

export const subashRouter = Router();

/** Services + districts for the tool enums. */
subashRouter.get("/config", (_req, res) => {
  res.json(getConfig());
});

/** Create or merge a draft registration (progressive capture). Returns the merged record. */
subashRouter.post("/registration", (req, res) => {
  const b = req.body ?? {};
  res.json(
    saveRegistration({
      id: b.id,
      service: b.service,
      name: b.name,
      phone: b.phone,
      address: b.address,
      district: b.district,
      pincode: b.pincode,
      productName: b.productName,
      modelNumber: b.modelNumber,
      serialNumber: b.serialNumber,
      purchaseDate: b.purchaseDate,
      shopName: b.shopName,
      shopLocation: b.shopLocation,
    })
  );
});

/** Validate the core fields and finalize — assigns the SC-##### id + Registered status. */
subashRouter.post("/complete", (req, res) => {
  const b = req.body ?? {};
  const result = completeRegistration({
    id: b.id,
    service: b.service,
    name: b.name,
    phone: b.phone,
    address: b.address,
    district: b.district,
    pincode: b.pincode,
    productName: b.productName,
    modelNumber: b.modelNumber,
    serialNumber: b.serialNumber,
    purchaseDate: b.purchaseDate,
    shopName: b.shopName,
    shopLocation: b.shopLocation,
  });
  res.status(result.ok ? 200 : 400).json(result);
});

/** Fetch a single registration. */
subashRouter.get("/registration/:id", (req, res) => {
  const registration = getRegistration(req.params.id);
  if (!registration) return res.status(404).json({ ok: false, error: "Registration not found." });
  res.json({ ok: true, registration });
});

/** Recently completed registrations (for the queue). */
subashRouter.get("/registrations", (_req, res) => {
  res.json({ registrations: listRegistrations() });
});

/** Export all completed registrations as a CSV the operator can save / open in Excel. */
subashRouter.get("/export.csv", (_req, res) => {
  const cols: { key: string; label: string }[] = [
    { key: "ref", label: "Registration ID" },
    { key: "name", label: "Name" },
    { key: "phone", label: "Mobile" },
    { key: "address", label: "Address" },
    { key: "district", label: "District" },
    { key: "pincode", label: "Pincode" },
    { key: "productName", label: "Product" },
    { key: "modelNumber", label: "Model No" },
    { key: "serialNumber", label: "Serial No" },
    { key: "purchaseDate", label: "Purchase Date" },
    { key: "shopName", label: "Shop" },
    { key: "shopLocation", label: "Shop Location" },
    { key: "createdAt", label: "Registered At" },
  ];
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = listRegistrations().map((r) => cols.map((c) => esc((r as any)[c.key])).join(","));
  const csv = [cols.map((c) => esc(c.label)).join(","), ...rows].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="subash-registrations.csv"');
  res.send("﻿" + csv); // BOM so Excel reads the Malayalam/UTF-8 correctly
});
