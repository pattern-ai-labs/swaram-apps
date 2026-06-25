import React from "react";
import ReactDOM from "react-dom/client";
import CarService from "./pages/CarService.tsx";
import "./index.css";

// Single-page app: this demo is just the car-service screen. No router needed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CarService />
  </React.StrictMode>
);
