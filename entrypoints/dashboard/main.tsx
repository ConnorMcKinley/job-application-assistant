import React from "react";
import { createRoot } from "react-dom/client";
import { Dashboard } from "../../src/ui/components/Dashboard";

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <React.StrictMode>
      <Dashboard />
    </React.StrictMode>,
  );
}
