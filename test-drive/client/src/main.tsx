import React from "react";
import ReactDOM from "react-dom/client";
import TestDrive from "./pages/TestDrive.tsx";
import "./index.css";

// Single-page app: this demo is just the test-drive screen. No router needed.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TestDrive />
  </React.StrictMode>
);
