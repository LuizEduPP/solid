export function tryHostname(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function hostnameFromUrl(url: string): string {
  return tryHostname(url) ?? url;
}

export function uniqueHostnamesFromUrls(urls: string[]): string[] {
  const domains = new Set<string>();
  for (const url of urls) {
    const domain = tryHostname(url);
    if (domain) domains.add(domain);
  }
  return [...domains];
}

export function countUniqueHostnames(urls: string[]): number {
  return uniqueHostnamesFromUrls(urls).length;
}

export function uniqueHostnamesFromHits(hits: Array<{ url: string }>): string[] {
  return uniqueHostnamesFromUrls(hits.map((hit) => hit.url));
}

export function uniqueUrlsByHostname(urls: string[]): string[] {
  const seenHosts = new Set<string>();
  const out: string[] = [];

  for (const url of urls) {
    const host = tryHostname(url);
    if (!host || seenHosts.has(host)) continue;
    seenHosts.add(host);
    out.push(url);
  }

  return out;
}

export function faviconUrl(url: string): string {
  const hostname = hostnameFromUrl(url);
  return `/favicons/${encodeURIComponent(hostname)}`;
}
