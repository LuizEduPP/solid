import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createOpenAiRouter } from "./api.js";
import { loadServerConfig } from "./config.js";
import { createFaviconRouter } from "./favicon.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../client");

const server = loadServerConfig();
const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));
app.route("/favicons", createFaviconRouter());
app.route("/v1", createOpenAiRouter());

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  app.use("/assets/*", serveStatic({ root: distDir }));
  app.get("/", (c) => {
    const html = readFileSync(path.join(distDir, "index.html"), "utf8");
    return c.html(html);
  });
  app.get("*", (c) => {
    const html = readFileSync(path.join(distDir, "index.html"), "utf8");
    return c.html(html);
  });
} else {
  app.get("/", (c) =>
    c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Solid</title>
    <style>
      body { font-family: system-ui, sans-serif; background: #0b1020; color: #e8edf8; display: grid; place-items: center; min-height: 100vh; margin: 0; }
      main { max-width: 36rem; padding: 2rem; text-align: center; }
      a { color: #7eb6ff; }
      code { background: #151d33; padding: 0.15rem 0.4rem; border-radius: 0.35rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Solid API</h1>
      <p>In development, open the UI at <a href="http://localhost:5173">http://localhost:5173</a>.</p>
      <p>API at <code>http://localhost:${server.port}</code></p>
    </main>
  </body>
</html>`),
  );
}

serve(
  {
    fetch: app.fetch,
    hostname: server.host,
    port: server.port,
  },
  (info) => {
    console.log(`Solid API on http://${info.address}:${info.port}`);
    if (!isProduction) {
      console.log("Web UI on http://localhost:5173");
    }
  },
);
