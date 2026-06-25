import React from "react";
import ReactDOM from "react-dom/client";
import Tutor from "./pages/Tutor.tsx";
import "./index.css";

// Single-page app: this demo is just the tutor screen. No router needed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Tutor />
  </React.StrictMode>
);
