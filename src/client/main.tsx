import "@mantine/core/styles.layer.css";
import "github-markdown-css/github-markdown-dark.css";

import { MantineProvider } from "@mantine/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { normalizeLocale } from "../shared";
import App, { CHAT_SESSION_PATH, HOME_PATH } from "./App";
import i18n from "./i18n";
import { loadWebSettings } from "./local-store";
import { theme } from "./theme";
import "./index.css";

void i18n.changeLanguage(normalizeLocale(loadWebSettings().locale));

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
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
