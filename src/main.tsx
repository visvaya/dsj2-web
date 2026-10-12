import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./ui/fonts.css";
import { App } from "./ui/app";
import "./ui/app.css";
import { webFontsReady } from "./ui/web-fonts";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}
// The first screen is drawn once its fonts can be, so nothing is laid out in the fallback font and moved later.
void webFontsReady(document.fonts).then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
