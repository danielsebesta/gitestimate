import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider, BaseStyles } from "@primer/react";
import "@primer/primitives/dist/css/primitives.css";
import "@primer/primitives/dist/css/functional/themes/light.css";
import "@primer/primitives/dist/css/functional/themes/dark.css";
import "./index.css";
import App from "./App";

const initialMode =
  (localStorage.getItem("color-mode") as "auto" | "light" | "dark" | null) ?? "auto";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider colorMode={initialMode}>
      <BaseStyles>
        <App />
      </BaseStyles>
    </ThemeProvider>
  </StrictMode>,
);
