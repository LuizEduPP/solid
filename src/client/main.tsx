import { MantineProvider, createTheme } from "@mantine/core";
import "@mantine/core/styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";

import App from "./App";
import i18n, { normalizeLocale } from "./i18n";
import { loadWebSettings } from "./settings";
import "./index.css";

const theme = createTheme({
  primaryColor: "cyan",
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  fontFamilyMonospace: '"IBM Plex Mono", monospace',
  defaultRadius: "md",
});

void i18n.changeLanguage(normalizeLocale(loadWebSettings().locale));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <MantineProvider theme={theme} defaultColorScheme="dark">
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<App />} />
            <Route path="/c/:sessionId" element={<App />} />
          </Routes>
        </BrowserRouter>
      </MantineProvider>
    </I18nextProvider>
  </StrictMode>,
);
