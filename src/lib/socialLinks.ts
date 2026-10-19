import type { MapItem } from "./types";

export interface SocialLink {
  label: string;
  icon: string;
  url: string;
}

const PLATFORMS: { hosts: string[]; label: string; icon: string }[] = [
  { hosts: ["instagram.com", "www.instagram.com"], label: "Instagram", icon: "📸" },
  { hosts: ["facebook.com", "www.facebook.com", "fb.com", "www.fb.com"], label: "Facebook", icon: "f" },
  { hosts: ["tiktok.com", "www.tiktok.com"], label: "TikTok", icon: "♪" },
  { hosts: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"], label: "X", icon: "𝕏" },
  { hosts: ["youtube.com", "www.youtube.com", "youtu.be"], label: "YouTube", icon: "▶" },
  { hosts: ["threads.net", "www.threads.net"], label: "Threads", icon: "@" },
];

/** Extract only recognized social links that are explicitly present on the listing. */
export function socialLinksForItem(item: MapItem): SocialLink[] {
  const sources = item.kind === "event"
    ? [item.url, item.ticket_url, item.description]
    : [item.website];
  const urls = new Set<string>();

  for (const source of sources) {
    if (!source) continue;
    const candidates: string[] = source.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
    if (/^https?:\/\//i.test(source.trim())) candidates.push(source.trim());
    for (const candidate of candidates) {
      try {
        const parsed = new URL(candidate.replace(/[.,;!?]+$/, ""));
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
        const platform = PLATFORMS.find(({ hosts }) => hosts.includes(parsed.hostname.toLowerCase()));
        if (platform) urls.add(`${platform.label}\u0000${parsed.toString()}`);
      } catch {
        // Ignore malformed URLs from third-party listing text.
      }
    }
  }

  return [...urls].map((value) => {
    const [label, url] = value.split("\u0000");
    const platform = PLATFORMS.find((entry) => entry.label === label)!;
    return { label, icon: platform.icon, url };
  });
}
