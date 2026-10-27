import type { MapItem } from "./types";

export interface SocialLink {
  label: string;
  platform: string;
  url: string;
}

const PLATFORMS: { hosts: string[]; label: string; platform: string }[] = [
  { hosts: ["instagram.com"], label: "Instagram", platform: "instagram" },
  { hosts: ["facebook.com", "fb.com"], label: "Facebook", platform: "facebook" },
  { hosts: ["tiktok.com"], label: "TikTok", platform: "tiktok" },
  { hosts: ["x.com", "twitter.com"], label: "X", platform: "x" },
  { hosts: ["youtube.com", "youtu.be"], label: "YouTube", platform: "youtube" },
  { hosts: ["threads.net"], label: "Threads", platform: "threads" },
  { hosts: ["linktr.ee", "linktree.com"], label: "Linktree", platform: "linktree" },
  { hosts: ["beacons.ai"], label: "Beacons", platform: "beacons" },
];

/** The link if it is an absolute http(s) URL, otherwise null. Listing and place links are third-party data, so
 *  anything else (javascript:, data:, app schemes) is never opened. */
export function webLink(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const URL_PATTERN = /(?:https?:\/\/)?(?:www\.)?[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.(?:[a-z]{2,})(?:\/[^\s<>"')\]]*)?/gi;

/** Build compact link buttons from URLs explicitly included with the listing. */
export function socialLinksForItem(item: MapItem): SocialLink[] {
  const sources = item.kind === "event"
    ? [item.url, item.ticket_url, item.description]
    : [item.website];
  const urls = new Set<string>();

  for (const source of sources) {
    if (!source) continue;
    const candidates: string[] = source.match(URL_PATTERN) ?? [];
    for (const candidate of candidates) {
      try {
        const normalized = candidate.startsWith("http") ? candidate : `https://${candidate}`;
        const parsed = new URL(normalized.replace(/[.,;!?]+$/, ""));
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
        const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
        const platform = PLATFORMS.find(({ hosts }) => hosts.includes(host));
        const label = platform?.label ?? host;
        const mark = platform?.platform ?? "link";
        urls.add(`${label}\u0000${mark}\u0000${parsed.toString()}`);
      } catch {
        // Ignore malformed URLs from third-party listing text.
      }
    }
  }

  return [...urls].map((value) => {
    const [label, platform, url] = value.split("\u0000");
    return { label, platform, url };
  });
}

export function descriptionWithoutLinks(item: MapItem): string | null {
  if (item.kind !== "event" || !item.description) return null;
  const description = item.description
    .replace(URL_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return description || null;
}
