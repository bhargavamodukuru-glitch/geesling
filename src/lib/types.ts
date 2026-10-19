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

export interface Leg {
  mode: "walk" | "transit";
  duration_s: number;
  distance_m: number;
  polyline: string | null;
  transit_lines: string[];
  estimated: boolean;
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
  walk?: Walk | null;
  error?: boolean;
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
