import React from "react";
import ReactDOM from "react-dom/client";
import Clinic from "./pages/Clinic.tsx";
import "./index.css";

// Single-page app: this demo is just the clinic screen. No router needed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Clinic />
  </React.StrictMode>
);
