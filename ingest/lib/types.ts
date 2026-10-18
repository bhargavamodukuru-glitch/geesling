export type SourceId = "toronto" | "ticketmaster" | "eventbrite";

export const CATEGORIES = [
  "music",
  "nightlife",
  "arts_culture",
  "gallery",
  "film",
  "food_drink",
  "market",
  "festival",
  "comedy",
  "theatre",
  "sports",
  "workshop",
  "community",
  "outdoors",
  "family",
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Session {
  start: string; // ISO-8601 UTC
  end: string; // ISO-8601 UTC
}

/** One event with its whole schedule, normalized from any source. Mirrors public.events. */
export interface NormalizedEvent {
  source: SourceId;
  source_id: string;
  title: string;
  description: string | null;
  categories: Category[];
  tags: string[];
  url: string | null;
  image_url: string | null;
  venue_name: string | null;
  address: string | null;
  lat: number;
  lng: number;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  currency: string;
  price_note: string | null;
  rsvp_required: boolean;
  rsvp_note: string | null;
  ticket_url: string | null;
  involves_alcohol: boolean;
  age_min: number | null;
  accessible: boolean | null;
  schedule: Session[];
  schedule_summary: string | null;
  first_start_at: string;
  last_end_at: string;
  quality_score: number;
}

export interface SourceResult {
  source: SourceId;
  events: NormalizedEvent[];
  fetched: number;
  skipped: number;
}

export interface IngestConfig {
  now: Date;
  horizonDays: number;
  ticketmasterApiKey: string | null;
  eventbriteToken: string | null;
  eventbriteOrganizerIds: string[];
  torontoFeedUrl: string;
}
