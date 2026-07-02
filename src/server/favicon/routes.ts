import { readFile } from "node:fs/promises";

import { Hono } from "hono";

import {
  contentTypeForFaviconPath,
  resolveFaviconFile,
} from "./cache.js";

export function createFaviconRouter(): Hono {
  const router = new Hono();

  router.get("/:hostname", async (c) => {
    const filePath = await resolveFaviconFile(c.req.param("hostname"));
    if (!filePath) return c.notFound();

    const bytes = await readFile(filePath);
    return c.body(bytes, 200, {
      "Content-Type": contentTypeForFaviconPath(filePath),
      "Cache-Control": "public, max-age=31536000, immutable",
    });
  });

  return router;
}
