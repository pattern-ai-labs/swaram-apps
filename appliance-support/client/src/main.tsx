import React from "react";
import ReactDOM from "react-dom/client";
import Support from "./pages/Support.tsx";
import "./index.css";

// Single-page app: this demo is just the customer-care screen. No router needed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Support />
  </React.StrictMode>
);
