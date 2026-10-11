import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/silkscreen/400.css";
import { App } from "./ui/app";
import "./ui/app.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
