export function parsePageReadUrl(line: string): string | null {
  const match = line.trim().match(/^Page read: (https?:\/\/\S+)$/i);
  return match?.[1] ?? null;
}

export function siteLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconUrl(url: string): string {
  const hostname = siteLabel(url);
  if (!hostname) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=32`;
}
