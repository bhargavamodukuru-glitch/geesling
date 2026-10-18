// Geesling guide — turns a prompt into a walk of real Toronto events + places.
// POST { prompt, history?, origin?, timeBudgetMinutes?, startAt?, freeOnly? }
//   → { message, walk | null }
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { contextBlock, MODEL, SYSTEM_PROMPT, TOOLS } from "./prompt.ts";
import { type MaxPrice, type PlaceItem, searchPlaces } from "./places.ts";
import { bestLeg, type Leg } from "./routes.ts";

const DOWNTOWN = { lat: 43.6532, lng: -79.3832 };
const MAX_TURNS = 8;
const HOURLY_LIMIT = Number(Deno.env.get("GUIDE_HOURLY_LIMIT") ?? 20);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EventItem {
  kind: "event";
  id: string;
  source: string;
  title: string;
  description: string | null;
  categories: string[];
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
  schedule_summary: string | null;
  next_start: string;
  next_end: string;
  is_live: boolean;
}

type Item = EventItem | PlaceItem;

interface WalkStop {
  order: number;
  kind: "event" | "place";
  item: Item;
  why: string;
  arrive_at: string;
  leave_at: string;
  stay_minutes: number;
  leg: Leg | null;
}

interface GuideRequest {
  prompt: string;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
  origin?: { lat: number; lng: number } | null;
  timeBudgetMinutes?: number | null;
  startAt?: string | null;
  freeOnly?: boolean;
}

interface PresentWalkInput {
  title: string;
  intro: string;
  outro: string;
  stops: Array<{ kind: "event" | "place"; id: string; why: string; stay_minutes: number }>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function isLatLng(v: unknown): v is { lat: number; lng: number } {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.lat === "number" && typeof o.lng === "number" && Math.abs(o.lat) <= 90 && Math.abs(o.lng) <= 180;
}

function walkId(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

function torontoLabel(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(at);
}

/** Compact view of an event for the model (keeps tokens low). */
function eventForModel(e: EventItem) {
  return {
    id: e.id,
    title: e.title,
    categories: e.categories,
    venue: e.venue_name,
    lat: Number(e.lat.toFixed(5)),
    lng: Number(e.lng.toFixed(5)),
    live_now: e.is_live,
    next_start: e.next_start,
    next_end: e.next_end,
    schedule: e.schedule_summary,
    is_free: e.is_free,
    price: e.is_free ? "free" : e.price_min !== null ? `${e.price_min}${e.price_max && e.price_max !== e.price_min ? `–${e.price_max}` : ""} ${e.currency}` : (e.price_note ?? "paid, price unlisted"),
    rsvp_required: e.rsvp_required,
    age_min: e.age_min,
    about: e.description?.slice(0, 280) ?? null,
  };
}

function placeForModel(p: PlaceItem) {
  return {
    id: p.id,
    name: p.name,
    type: p.primary_type,
    lat: Number(p.lat.toFixed(5)),
    lng: Number(p.lng.toFixed(5)),
    price_level: p.price_level,
    is_free: p.is_free,
    rating: p.rating,
    reviews: p.rating_count,
    open_now: p.open_now,
    summary: p.summary,
  };
}

async function runSearchEvents(db: SupabaseClient, input: Record<string, unknown>, ctx: { origin: { lat: number; lng: number }; endIso: string; freeOnly: boolean }) {
  const near = isLatLng(input.near) ? input.near : ctx.origin;
  const { data, error } = await db.rpc("search_events", {
    q: typeof input.query === "string" && input.query.trim() ? input.query.trim() : null,
    from_ts: typeof input.from === "string" ? input.from : new Date().toISOString(),
    to_ts: typeof input.to === "string" ? input.to : ctx.endIso,
    center_lat: near.lat,
    center_lng: near.lng,
    radius_km: typeof input.radius_km === "number" ? Math.min(input.radius_km, 40) : 6,
    free_only: ctx.freeOnly || input.free_only === true,
    max_price: typeof input.max_price === "number" ? input.max_price : null,
    cats: Array.isArray(input.categories) && input.categories.length ? input.categories : null,
    lim: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 25) : 12,
  });
  if (error) throw new Error(`search_events failed: ${error.message}`);
  return ((data ?? []) as Array<Omit<EventItem, "kind">>).map((row) => ({
    ...row,
    kind: "event" as const,
    price_min: row.price_min === null ? null : Number(row.price_min),
    price_max: row.price_max === null ? null : Number(row.price_max),
  }));
}

async function cachePlaces(db: SupabaseClient, places: PlaceItem[]): Promise<void> {
  if (places.length === 0) return;
  const rows = places.map((p) => ({
    id: p.id,
    name: p.name,
    primary_type: p.primary_type,
    types: p.types,
    address: p.address,
    lat: p.lat,
    lng: p.lng,
    price_level: p.price_level,
    is_free: p.is_free,
    involves_alcohol: p.involves_alcohol,
    rating: p.rating,
    rating_count: p.rating_count,
    website: p.website,
    maps_url: p.maps_url,
    summary: p.summary,
    opening_hours: p.hours ? { weekday: p.hours } : null,
    fetched_at: new Date().toISOString(),
  }));
  const { error } = await db.from("places").upsert(rows);
  if (error) console.error("place cache failed", error.message);
}

/** Lays the chosen stops onto a timeline and routes between them. */
async function buildStops(
  chosen: PresentWalkInput["stops"],
  known: Map<string, Item>,
  origin: { lat: number; lng: number } | null,
  start: Date,
  routesKey: string | null,
): Promise<WalkStop[]> {
  const stops: WalkStop[] = [];
  let cursor = start;
  let previous: { lat: number; lng: number } | null = origin;
  for (const [index, stop] of chosen.entries()) {
    const item = known.get(stop.id)!;
    const leg = previous ? await bestLeg(routesKey, previous, item, cursor) : null;
    let arrive = new Date(cursor.getTime() + (leg?.duration_s ?? 0) * 1000);
    let stay = Math.max(10, Math.min(stop.stay_minutes, 240));
    if (item.kind === "event") {
      const startsAt = new Date(item.next_start);
      const endsAt = new Date(item.next_end);
      if (arrive < startsAt) arrive = startsAt; // wait for doors
      const remaining = Math.round((endsAt.getTime() - arrive.getTime()) / 60_000);
      if (remaining > 0) stay = Math.min(stay, remaining);
    }
    const leave = new Date(arrive.getTime() + stay * 60_000);
    stops.push({
      order: index + 1,
      kind: item.kind,
      item,
      why: stop.why,
      arrive_at: arrive.toISOString(),
      leave_at: leave.toISOString(),
      stay_minutes: stay,
      leg,
    });
    cursor = leave;
    previous = { lat: item.lat, lng: item.lng };
  }
  return stops;
}

async function rateLimited(db: SupabaseClient, owner: string): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count, error } = await db.from("guide_usage").select("id", { count: "exact", head: true }).eq("owner", owner).gte("created_at", since);
  if (error) throw new Error(`rate limit check failed: ${error.message}`);
  if ((count ?? 0) >= HOURLY_LIMIT) return true;
  await db.from("guide_usage").insert({ owner });
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const placesKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY") ?? null;
  if (!anthropicKey) return json({ error: "ANTHROPIC_API_KEY is not configured" }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: userData, error: authError } = await db.auth.getUser(token);
  if (authError || !userData.user) return json({ error: "Sign-in required" }, 401);
  const owner = userData.user.id;

  let body: GuideRequest;
  try {
    body = (await req.json()) as GuideRequest;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim().slice(0, 1200) : "";
  if (!prompt) return json({ error: "prompt is required" }, 400);

  if (await rateLimited(db, owner)) {
    return json({ message: "Honk! My feet need a rest — you've asked a lot this hour. Try me again in a bit.", walk: null }, 429);
  }

  const now = new Date();
  const start = body.startAt && !Number.isNaN(Date.parse(body.startAt)) && Date.parse(body.startAt) > now.getTime() ? new Date(body.startAt) : now;
  const budget = typeof body.timeBudgetMinutes === "number" && body.timeBudgetMinutes > 0 ? Math.min(body.timeBudgetMinutes, 16 * 60) : null;
  const end = new Date(start.getTime() + (budget ?? 6 * 60) * 60_000);
  const origin = isLatLng(body.origin) ? body.origin : null;
  const searchOrigin = origin ?? DOWNTOWN;
  const freeOnly = body.freeOnly === true;

  const history: Anthropic.Beta.BetaMessageParam[] = (body.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 2000) }));
  // The API requires the first message to be from the user.
  while (history.length && history[0].role !== "user") history.shift();

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    {
      role: "user",
      content: `${contextBlock({
        nowLabel: torontoLabel(now),
        nowIso: now.toISOString(),
        origin: searchOrigin,
        originIsUser: origin !== null,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        timeBudgetMinutes: budget,
        freeOnly,
      })}\n\nRequest: ${prompt}`,
    },
  ];

  const client = new Anthropic({ apiKey: anthropicKey });
  const known = new Map<string, Item>();
  let finalText = "";
  let presented: PresentWalkInput | null = null;

  try {
    for (let turn = 0; turn < MAX_TURNS && !presented; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return json({ message: "Honk… that's not something I can help with. Ask me about food, music, art or a walk around the city!", walk: null });
      }

      const texts = response.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text);
      if (texts.length) finalText = texts.join("\n").trim();

      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason !== "tool_use") break;

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: response.content });

      const results = await Promise.all(
        toolUses.map(async (tool): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
          const input = (tool.input ?? {}) as Record<string, unknown>;
          try {
            if (tool.name === "search_events") {
              const events = await runSearchEvents(db, input, { origin: searchOrigin, endIso: end.toISOString(), freeOnly });
              events.forEach((e) => known.set(e.id, e));
              return { type: "tool_result", tool_use_id: tool.id, content: JSON.stringify({ count: events.length, events: events.map(eventForModel) }) };
            }
            if (tool.name === "search_places") {
              if (!placesKey) return { type: "tool_result", tool_use_id: tool.id, content: "Place search is unavailable right now; build the walk from events.", is_error: true };
              const query = typeof input.query === "string" ? input.query : "";
              if (!query.trim()) return { type: "tool_result", tool_use_id: tool.id, content: "query is required", is_error: true };
              const places = await searchPlaces(placesKey, {
                query,
                near: isLatLng(input.near) ? input.near : searchOrigin,
                radiusMeters: typeof input.radius_m === "number" ? input.radius_m : 2500,
                maxPrice: freeOnly ? "inexpensive" : ((["inexpensive", "moderate", "expensive", "any"] as const).find((p) => p === input.max_price) ?? "any") as MaxPrice,
                openNow: input.open_now === true,
                limit: typeof input.limit === "number" ? input.limit : 8,
              });
              const filtered = freeOnly ? places.filter((p) => p.is_free) : places;
              filtered.forEach((p) => known.set(p.id, p));
              await cachePlaces(db, filtered);
              return { type: "tool_result", tool_use_id: tool.id, content: JSON.stringify({ count: filtered.length, places: filtered.map(placeForModel) }) };
            }
            if (tool.name === "present_walk") {
              const walk = input as unknown as PresentWalkInput;
              const unknownIds = (walk.stops ?? []).filter((s) => !known.has(s.id) || known.get(s.id)!.kind !== s.kind).map((s) => s.id);
              if (!Array.isArray(walk.stops) || walk.stops.length === 0) {
                return { type: "tool_result", tool_use_id: tool.id, content: "A walk needs at least one stop.", is_error: true };
              }
              if (unknownIds.length) {
                return {
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: `These ids were not returned by a search (or have the wrong kind): ${unknownIds.join(", ")}. Use only ids from search results.`,
                  is_error: true,
                };
              }
              presented = walk;
              return { type: "tool_result", tool_use_id: tool.id, content: "Walk presented." };
            }
            return { type: "tool_result", tool_use_id: tool.id, content: `Unknown tool ${tool.name}`, is_error: true };
          } catch (error) {
            console.error(tool.name, error);
            return { type: "tool_result", tool_use_id: tool.id, content: `Tool failed: ${(error as Error).message}`, is_error: true };
          }
        }),
      );
      if (!presented) messages.push({ role: "user", content: results });
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ message: "Honk! Lots of geese flapping at once. Try again in a minute.", walk: null }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic error", error.status, error.message);
      return json({ message: "My map blew away in the wind. Try that again?", walk: null }, 502);
    }
    throw error;
  }

  if (!presented) {
    return json({ message: finalText || "Honk? Tell me a bit more — what are you in the mood for?", walk: null });
  }

  const chosen = (presented as PresentWalkInput).stops.slice(0, 8);
  const stops = await buildStops(chosen, known, origin, start, placesKey);
  const lastLeave = stops.length ? new Date(stops[stops.length - 1].leave_at) : start;
  const walk = {
    id: walkId(),
    owner,
    prompt,
    title: (presented as PresentWalkInput).title.slice(0, 80),
    intro: (presented as PresentWalkInput).intro,
    outro: (presented as PresentWalkInput).outro,
    time_budget_minutes: budget,
    start_lat: origin?.lat ?? null,
    start_lng: origin?.lng ?? null,
    stops,
    total_minutes: Math.round((lastLeave.getTime() - start.getTime()) / 60_000),
    created_at: new Date().toISOString(),
  };
  const { error: saveError } = await db.from("walks").insert(walk);
  if (saveError) console.error("walk save failed", saveError.message);

  return json({ message: walk.intro, walk });
});
