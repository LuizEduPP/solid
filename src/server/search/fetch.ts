const FETCH_TIMEOUT_MS = 8_000;
const MAX_PAGE_CHARS = 3_500;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function fetchPageText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Solid/1.0 (+research)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });

    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      return null;
    }

    const html = await response.text();
    const text = stripHtml(html);
    return text.length > 0 ? text.slice(0, MAX_PAGE_CHARS) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchPages(
  urls: string[],
  maxPages: number,
  skipUrls: Set<string>,
): Promise<Array<{ url: string; text: string }>> {
  const results: Array<{ url: string; text: string }> = [];

  for (const url of urls) {
    if (results.length >= maxPages) break;
    if (skipUrls.has(url)) continue;

    const text = await fetchPageText(url);
    if (text) {
      skipUrls.add(url);
      results.push({ url, text });
    }
  }

  return results;
}
