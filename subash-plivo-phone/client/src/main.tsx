import React from "react";
import ReactDOM from "react-dom/client";
import Subash from "./pages/Subash.tsx";
import "./index.css";

// Single-page app: this demo is just the product-registration screen. No router needed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Subash />
  </React.StrictMode>
);
