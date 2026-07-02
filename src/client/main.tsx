import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import App, { CHAT_SESSION_PATH, HOME_PATH } from "./App";
import i18n, { normalizeLocale } from "./i18n";
import { loadWebSettings } from "./local-store";
import "./index.css";

/** Neutral zinc ladder for surfaces; blue only via primaryColor on actions/selection. */
const theme = createTheme({
  primaryColor: "indigo",
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", monospace',
  defaultRadius: "md",
  colors: {
    dark: [
      "#ececf1",
      "#d4d4d8",
      "#a1a1aa",
      "#71717a",
      "#52525b",
      "#3f3f46",
      "#323238",
      "#25262b",
      "#1a1b1e",
      "#111113",
    ],
    indigo: [
      "#eef0ff",
      "#dce1ff",
      "#b8c2ff",
      "#8f9eff",
      "#6b7ff5",
      "#5c7cfa",
      "#4c6ef5",
      "#4263eb",
      "#3b5bdb",
      "#364fc7",
    ],
  },
  other: {
    bodyBg: "#111113",
  },
});

void i18n.changeLanguage(normalizeLocale(loadWebSettings().locale));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <BrowserRouter>
          <Routes>
            <Route path={HOME_PATH} element={<App />} />
            <Route path={CHAT_SESSION_PATH} element={<App />} />
          </Routes>
        </BrowserRouter>
      </MantineProvider>
    </I18nextProvider>
  </StrictMode>,
);
