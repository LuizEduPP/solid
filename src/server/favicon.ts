import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { Hono } from "hono";

import { tryHostname } from "../shared.js";

function getFaviconCacheDir(): string {
  const fromEnv = process.env.FAVICON_CACHE_DIR?.trim();
  if (fromEnv) {
    return path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv);
  }
  return path.join(process.cwd(), "cache/favicons");
}

const FETCH_TIMEOUT_MS = 6_000;

const EXT_BY_TYPE: Record<string, string> = {
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/jpeg": "jpg",
};

const TYPE_BY_EXT: Record<string, string> = {
  ico: "image/x-icon",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  jpg: "image/jpeg",
};

const DEFAULT_GLOBE_ICON = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#495057" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  "utf8",
);

const FAVICON_CACHE_HEADERS = {
  "Cache-Control": "public, max-age=31536000, immutable",
} as const;

const DEFAULT_ICON_HEADERS = {
  "Content-Type": "image/svg+xml",
  "Cache-Control": "public, max-age=86400",
} as const;

function safeHostname(hostname: string): string | null {
  const normalized = hostname.trim().toLowerCase().replace(/^www\./, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) return null;
  return normalized;
}

function cacheBasename(hostname: string): string {
  return hostname.replace(/[^a-zA-Z0-9.-]/g, "_");
}

function cacheFilePath(hostname: string, ext: string): string {
  return path.join(getFaviconCacheDir(), `${cacheBasename(hostname)}.${ext}`);
}

async function findCachedFile(hostname: string): Promise<string | null> {
  for (const ext of Object.keys(TYPE_BY_EXT)) {
    const filePath = cacheFilePath(hostname, ext);
    try {
      await readFile(filePath);
      return filePath;
    } catch {
      // try next extension
    }
  }
  return null;
}

async function fetchIconBytes(url: string): Promise<{ bytes: Buffer; ext: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Solid/1.0 (+research)" },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = EXT_BY_TYPE[contentType] ?? "ico";
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0) return null;

    return { bytes, ext };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function downloadFavicon(hostname: string): Promise<string | null> {
  const sources = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`,
    `https://${hostname}/favicon.ico`,
  ];

  for (const source of sources) {
    const result = await fetchIconBytes(source);
    if (!result) continue;

    await mkdir(getFaviconCacheDir(), { recursive: true });
    const filePath = cacheFilePath(hostname, result.ext);
    await writeFile(filePath, result.bytes);
    return filePath;
  }

  return null;
}

function contentTypeForFaviconPath(filePath: string): string {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return TYPE_BY_EXT[ext] ?? "application/octet-stream";
}

async function resolveFaviconFile(hostname: string): Promise<string | null> {
  const safe = safeHostname(hostname);
  if (!safe) return null;

  const cached = await findCachedFile(safe);
  if (cached) return cached;

  return downloadFavicon(safe);
}

export async function cacheFaviconsForUrls(urls: string[]): Promise<void> {
  const hostnames = new Set<string>();
  for (const url of urls) {
    const hostname = tryHostname(url);
    if (hostname) hostnames.add(hostname);
  }

  await Promise.all([...hostnames].map((hostname) => resolveFaviconFile(hostname)));
}

export function createFaviconRouter(): Hono {
  const router = new Hono();

  router.get("/default", (c) => c.body(DEFAULT_GLOBE_ICON, 200, DEFAULT_ICON_HEADERS));

  router.get("/:hostname", async (c) => {
    const hostname = c.req.param("hostname");
    if (hostname === "default") {
      return c.body(DEFAULT_GLOBE_ICON, 200, DEFAULT_ICON_HEADERS);
    }

    const filePath = await resolveFaviconFile(hostname);
    if (!filePath) {
      return c.body(DEFAULT_GLOBE_ICON, 200, DEFAULT_ICON_HEADERS);
    }

    const bytes = await readFile(filePath);
    return c.body(bytes, 200, {
      "Content-Type": contentTypeForFaviconPath(filePath),
      ...FAVICON_CACHE_HEADERS,
    });
  });

  return router;
}
