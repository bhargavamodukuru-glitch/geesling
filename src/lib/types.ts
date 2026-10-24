import type { Choices } from "./choices";

export interface EventItem {
  kind: "event";
  id: string;
  source: "toronto" | "ticketmaster" | "eventbrite";
  title: string;
  description: string | null;
  categories: string[];
  tags?: string[];
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
  accessible?: boolean | null;
  schedule_summary: string | null;
  next_start: string;
  next_end: string;
  is_live: boolean;
}

export interface PlaceItem {
  kind: "place";
  id: string;
  name: string;
  primary_type: string | null;
  types: string[];
  address: string | null;
  lat: number;
  lng: number;
  price_level: string | null;
  /** Google's per-person price range in CAD. Missing on walks saved before it was added. */
  price_from?: number | null;
  price_to?: number | null;
  is_free: boolean;
  involves_alcohol: boolean;
  rating: number | null;
  rating_count: number | null;
  website: string | null;
  maps_url: string | null;
  summary: string | null;
  open_now: boolean | null;
  hours: string[] | null;
}

export type MapItem = EventItem | PlaceItem;

export interface TransitStop {
  name: string;
  lat: number;
  lng: number;
}

/** Part of a TTC leg (same shape as the guide's LegSegment in supabase/functions/geesling/routes.ts). */
export interface LegSegment {
  mode: "walk" | "transit";
  duration_s: number;
  distance_m: number;
  polylines: string[];
  line?: string;
  headsign?: string | null;
  stop_count?: number | null;
  board?: TransitStop | null;
  alight?: TransitStop | null;
  departs_at?: string | null;
}

export interface Leg {
  mode: "walk" | "transit";
  duration_s: number;
  distance_m: number;
  polyline: string | null;
  transit_lines: string[];
  estimated: boolean;
  /** Where to walk, board and get off on a TTC leg. Missing on walks saved before it was added. */
  segments?: LegSegment[];
}

export interface WalkStop {
  order: number;
  kind: "event" | "place";
  item: MapItem;
  why: string;
  arrive_at: string;
  leave_at: string;
  stay_minutes: number;
  leg: Leg | null;
}

export interface Walk {
  /** "run" for a running route ("I want to run a 15k"); missing on routes saved before runs existed. */
  activity?: "walk" | "run";
  run_target_km?: number | null;
  run_pace_min_per_km?: number | null;
  id: string;
  prompt: string;
  title: string;
  intro: string;
  outro: string | null;
  time_budget_minutes: number | null;
  start_lat: number | null;
  start_lng: number | null;
  stops: WalkStop[];
  total_minutes: number | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  /** Shorter text shown in the bubble when `text` is a long prompt composed by the guided planner. */
  display?: string;
  walk?: Walk | null;
  error?: boolean;
  musicCrawlerLink?: boolean;
  /** Tappable answers to the goose's follow-up question (plus Other). */
  choices?: Choices | null;
}

export interface Bounds {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export type TimeWindow = "now" | "today" | "weekend" | "week";

export interface EventFilters {
  window: TimeWindow;
  /** Selected Toronto calendar date (YYYY-MM-DD), or null to use the time window. */
  date: string | null;
  freeOnly: boolean;
  paidOnly: boolean;
  drinksOnly: boolean;
  rsvpOnly: boolean;
  categories: string[];
}

export interface SavedItem {
  kind: "event" | "place" | "walk";
  item_id: string;
  snapshot: MapItem | Walk;
  created_at: string;
}

export function itemTitle(item: MapItem): string {
  return item.kind === "event" ? item.title : item.name;
}
