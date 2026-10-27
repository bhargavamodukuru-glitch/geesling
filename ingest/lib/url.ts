// Third-party links are kept only when they are web links. Pure (tests/url.test.ts).
import type { NormalizedEvent } from "./types.ts";

/** The link if it is an absolute http(s) URL, otherwise null (drops javascript:, data:, app schemes and junk). */
export function webUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The event with every link it carries checked by webUrl; the events table refuses anything else. */
export function withWebLinks(event: NormalizedEvent): NormalizedEvent {
  return { ...event, url: webUrl(event.url), ticket_url: webUrl(event.ticket_url), image_url: webUrl(event.image_url) };
}
