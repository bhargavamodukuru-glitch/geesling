// Eventbrite API v3 — live public events of the Toronto organizers listed in
// public.eventbrite_organizers (Eventbrite retired its public city-wide search API,
// and its Terms prohibit scraping, so we follow organizers through the official API).
// https://www.eventbrite.com/platform/api#/reference/event/list/list-events-by-organization
import type { IngestConfig, NormalizedEvent, SourceResult } from "../lib/types.ts";
import { detectAlcohol, detectRsvp, inferCategories, isInToronto, mapLabels, qualityScore, stripHtml } from "../lib/classify.ts";
import { normalizeSchedule, summarizeSchedule } from "../lib/time.ts";

interface EbMoney {
  major_value?: string;
  currency?: string;
}

interface EbEvent {
  id: string;
  series_id?: string | null;
  is_series?: boolean;
  name?: { text?: string };
  description?: { text?: string };
  summary?: string;
  url?: string;
  start?: { utc?: string };
  end?: { utc?: string };
  is_free?: boolean;
  online_event?: boolean;
  status?: string;
  logo?: { url?: string; original?: { url?: string } } | null;
  category?: { short_name?: string; name?: string } | null;
  subcategory?: { name?: string } | null;
  venue?: {
    name?: string;
    latitude?: string;
    longitude?: string;
    address?: { localized_address_display?: string; latitude?: string; longitude?: string };
  } | null;
  ticket_availability?: {
    minimum_ticket_price?: EbMoney | null;
    maximum_ticket_price?: EbMoney | null;
    is_sold_out?: boolean;
  } | null;
}

interface EbPage {
  events?: EbEvent[];
  pagination?: { has_more_items?: boolean; continuation?: string };
}

const BASE = "https://www.eventbriteapi.com/v3";

async function fetchOrganizerEvents(token: string, organizerId: string): Promise<EbEvent[]> {
  const out: EbEvent[] = [];
  let continuation: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params = new URLSearchParams({
      status: "live",
      order_by: "start_asc",
      expand: "venue,ticket_availability,category,subcategory",
      page_size: "50",
    });
    if (continuation) params.set("continuation", continuation);
    const response = await fetch(`${BASE}/organizers/${encodeURIComponent(organizerId)}/events/?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 429) {
      await new Promise((r) => setTimeout(r, 3000));
      page--;
      continue;
    }
    if (!response.ok) throw new Error(`Eventbrite organizer ${organizerId} returned ${response.status}`);
    const data = (await response.json()) as EbPage;
    out.push(...(data.events ?? []));
    if (!data.pagination?.has_more_items || !data.pagination.continuation) break;
    continuation = data.pagination.continuation;
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

function money(value: EbMoney | null | undefined): number | null {
  if (!value?.major_value) return null;
  const n = Number(value.major_value);
  return Number.isFinite(n) ? n : null;
}

/** Series occurrences share series_id → one event with a schedule. */
function normalizeGroup(group: EbEvent[], config: IngestConfig): NormalizedEvent | null {
  const primary = group[0];
  const title = primary.name?.text?.trim();
  if (!title || primary.online_event) return null;
  const lat = Number(primary.venue?.latitude ?? primary.venue?.address?.latitude);
  const lng = Number(primary.venue?.longitude ?? primary.venue?.address?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInToronto(lat, lng)) return null;

  const sessions = group
    .filter((e) => e.start?.utc && e.end?.utc && e.status !== "canceled")
    .map((e) => ({ start: new Date(e.start!.utc!).toISOString(), end: new Date(e.end!.utc!).toISOString() }));
  const schedule = normalizeSchedule(sessions, config.now, config.horizonDays);
  if (schedule.length === 0) return null;

  const description = stripHtml(primary.description?.text) ?? stripHtml(primary.summary);
  const labels = [primary.category?.short_name, primary.category?.name, primary.subcategory?.name];
  const text = `${title}\n${description ?? ""}\n${primary.venue?.name ?? ""}`;
  const categories = inferCategories(title, description, mapLabels(labels));
  const min = money(primary.ticket_availability?.minimum_ticket_price);
  const max = money(primary.ticket_availability?.maximum_ticket_price);
  const isFree = Boolean(primary.is_free) || (min === 0 && (max ?? 0) === 0);
  const soldOut = Boolean(primary.ticket_availability?.is_sold_out);

  const base = {
    source: "eventbrite" as const,
    source_id: primary.series_id || primary.id,
    title,
    description,
    categories,
    tags: labels.filter((l): l is string => Boolean(l)).map((l) => l.toLowerCase()),
    url: primary.url ?? null,
    image_url: primary.logo?.original?.url ?? primary.logo?.url ?? null,
    venue_name: primary.venue?.name ?? null,
    address: primary.venue?.address?.localized_address_display ?? null,
    lat,
    lng,
    is_free: isFree,
    price_min: isFree ? null : min,
    price_max: isFree ? null : max,
    currency: primary.ticket_availability?.minimum_ticket_price?.currency ?? "CAD",
    price_note: soldOut ? "Sold out — check for waitlist" : null,
    // Every Eventbrite listing requires registering for a (free or paid) ticket.
    rsvp_required: true,
    rsvp_note: detectRsvp(description ?? "")
      ? "Registration required — reserve on Eventbrite"
      : isFree
        ? "Free, but grab a ticket on Eventbrite first"
        : "Buy tickets ahead on Eventbrite",
    ticket_url: primary.url ?? null,
    involves_alcohol: detectAlcohol(text, null, categories),
    age_min: null,
    accessible: null,
    schedule,
    schedule_summary: summarizeSchedule(schedule),
    first_start_at: schedule[0].start,
    last_end_at: schedule.reduce((m, s) => (s.end > m ? s.end : m), schedule[0].end),
  };
  return { ...base, quality_score: qualityScore(base, true) };
}

export async function fetchEventbrite(config: IngestConfig): Promise<SourceResult> {
  if (!config.eventbriteToken) throw new Error("EVENTBRITE_TOKEN is not set");
  if (config.eventbriteOrganizerIds.length === 0) return { source: "eventbrite", events: [], fetched: 0, skipped: 0 };

  const raw: EbEvent[] = [];
  for (const organizerId of config.eventbriteOrganizerIds) {
    raw.push(...(await fetchOrganizerEvents(config.eventbriteToken, organizerId)));
  }
  const groups = new Map<string, EbEvent[]>();
  for (const event of raw) {
    const key = event.series_id || event.id;
    groups.set(key, [...(groups.get(key) ?? []), event]);
  }
  const events: NormalizedEvent[] = [];
  let skipped = 0;
  for (const group of groups.values()) {
    const event = normalizeGroup(group, config);
    if (event) events.push(event);
    else skipped++;
  }
  return { source: "eventbrite", events, fetched: raw.length, skipped };
}
