// Geesling guide — turns a prompt into a walk of real Toronto events + places.
// POST { prompt, history?, origin?, timeBudgetMinutes?, startAt?, freeOnly?, travel?, budgetLimit?, partySize? }
//   → { message, walk | null }
import Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { checkBudget, fitsPerPerson, parseBudget } from "./budget.ts";
import { dayPart, notBefore } from "./daytime.ts";
import { relativeDay, requestedStart, torontoDay } from "./when.ts";
import { leavesTooMuchTime, minutesLeftTonight, statedDuration } from "./fill.ts";
import { contextBlock, MODEL, SYSTEM_PROMPT, TOOLS } from "./prompt.ts";
import { type MaxPrice, type PlaceItem, searchPlaces } from "./places.ts";
import { bestLeg, type Leg } from "./routes.ts";

const DOWNTOWN = { lat: 43.6532, lng: -79.3832 };
const MAX_TURNS = 8;
// A long outing (6+ hours) needs more searching, so it gets more turns and more thinking.
const LONG_OUTING_MINUTES = 360;
const LONG_MAX_TURNS = 11;
// With this many turns left the guide is told to present what it has instead of searching more.
const WRAP_UP_TURNS_LEFT = 2;
const MAX_INTERSTOP_TRAVEL_SECONDS = 20 * 60;
const MAX_PART_CHANGE_TRAVEL_SECONDS = 40 * 60;
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
  travel?: "walk" | "transit" | "flexible";
  /** Planner spend limit in CAD for `partySize` people. */
  budgetLimit?: number | null;
  partySize?: number;
}

interface RequestedDateRange {
  from: Date;
  to: Date;
  label: string;
}

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8,
  september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11,
};

function dayRange(year: number, month: number, day: number): RequestedDateRange {
  const from = torontoMidnightUtc(year, month, day);
  const label = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(from);
  return { from, to: torontoMidnightUtc(year, month, day + 1), label };
}

function torontoMidnightUtc(year: number, month: number, day: number): Date {
  const wanted = Date.UTC(year, month, day);
  const probe = new Date(wanted);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(probe);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const observed = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return new Date(wanted - (observed - wanted));
}

/** Resolve explicit month/day requests in Toronto time; an omitted past year means the next occurrence. */
function requestedDateRange(prompt: string, now: Date): RequestedDateRange | null {
  const found: Array<{ year?: number; month: number; day: number }> = [];
  const monthDate = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?/gi;
  for (const match of prompt.matchAll(monthDate)) {
    const month = MONTHS[match[1].toLowerCase()];
    const day = Number(match[2]);
    if (day < 1 || day > 31) continue;
    found.push({ year: match[3] ? Number(match[3]) : undefined, month, day });
    const tail = prompt.slice((match.index ?? 0) + match[0].length);
    const shorthand = /^\s*(?:,?\s*(?:and|&|to|through|-)\s*)(\d{1,2})(?:st|nd|rd|th)?\b/i.exec(tail);
    if (shorthand) {
      const shortDay = Number(shorthand[1]);
      if (shortDay >= 1 && shortDay <= 31) found.push({ year: match[3] ? Number(match[3]) : undefined, month, day: shortDay });
    }
  }
  for (const match of prompt.matchAll(/\b(20\d{2})-(\d{2})-(\d{2})\b/g)) {
    found.push({ year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) });
  }
  if (!found.length) return null;

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const today = Date.UTC(
    Number(todayParts.find((part) => part.type === "year")?.value),
    Number(todayParts.find((part) => part.type === "month")?.value) - 1,
    Number(todayParts.find((part) => part.type === "day")?.value),
  );
  const dates: Array<{ year: number; month: number; day: number; stamp: number }> = [];
  for (const part of found) {
    let year = part.year ?? new Date(today).getUTCFullYear();
    let stamp = Date.UTC(year, part.month, part.day);
    const check = new Date(stamp);
    if (check.getUTCMonth() !== part.month || check.getUTCDate() !== part.day) continue;
    if (!part.year && stamp < today) {
      year += 1;
      stamp = Date.UTC(year, part.month, part.day);
    }
    if (!part.year && dates.length && stamp < dates[dates.length - 1].stamp) {
      year += 1;
      stamp = Date.UTC(year, part.month, part.day);
    }
    dates.push({ year, month: part.month, day: part.day, stamp });
  }
  if (!dates.length) return null;
  dates.sort((a, b) => a.stamp - b.stamp);
  const first = dates[0];
  const last = dates[dates.length - 1];
  const from = torontoMidnightUtc(first.year, first.month, first.day);
  const to = torontoMidnightUtc(last.year, last.month, last.day + 1);
  const labelDate = (date: typeof first) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", month: "long", day: "numeric", year: "numeric",
  }).format(torontoMidnightUtc(date.year, date.month, date.day));
  return { from, to, label: first.stamp === last.stamp ? labelDate(first) : `${labelDate(first)} through ${labelDate(last)}` };
}

interface PresentWalkInput {
  title: string;
  intro: string;
  outro: string;
  stops: Array<{ kind: "event" | "place"; id: string; why: string; stay_minutes: number; arrive_after?: string }>;
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
    price_per_person: p.price_from === null ? "not listed" : p.price_to === null ? `${p.price_from}+ CAD` : `${p.price_from}–${p.price_to} CAD`,
    is_free: p.is_free,
    rating: p.rating,
    reviews: p.rating_count,
    open_now: p.open_now,
    hours: p.hours,
    google_review_excerpts: p.review_evidence?.map((review) => ({
      rating: review.rating,
      published: review.published,
      author: review.author,
      text: review.text,
      google_review_link: review.url,
    })) ?? [],
    summary: p.summary,
  };
}

async function runSearchEvents(db: SupabaseClient, input: Record<string, unknown>, ctx: { origin: { lat: number; lng: number }; fromIso: string; endIso: string; freeOnly: boolean; requestedDates: boolean; perPersonLimit: number | null }) {
  const near = isLatLng(input.near) ? input.near : ctx.origin;
  const { data, error } = await db.rpc("search_events", {
    q: typeof input.query === "string" && input.query.trim() ? input.query.trim() : null,
    from_ts: ctx.requestedDates ? ctx.fromIso : typeof input.from === "string" ? input.from : ctx.fromIso,
    to_ts: ctx.requestedDates ? ctx.endIso : typeof input.to === "string" ? input.to : ctx.endIso,
    center_lat: near.lat,
    center_lng: near.lng,
    radius_km: typeof input.radius_km === "number" ? Math.min(input.radius_km, 40) : 6,
    free_only: ctx.freeOnly || input.free_only === true,
    max_price:
      ctx.perPersonLimit !== null
        ? Math.min(ctx.perPersonLimit, typeof input.max_price === "number" ? input.max_price : Infinity)
        : typeof input.max_price === "number" ? input.max_price : null,
    cats: Array.isArray(input.categories) && input.categories.length ? input.categories : null,
    lim: typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 12) : 10,
  });
  if (error) throw new Error(`search_events failed: ${error.message}`);
  return ((data ?? []) as Array<Omit<EventItem, "kind">>).map((row) => ({
    ...row,
    kind: "event" as const,
    price_min: row.price_min === null ? null : Number(row.price_min),
    price_max: row.price_max === null ? null : Number(row.price_max),
  }));
}

/** Lays the chosen stops onto a timeline and routes between them. */
async function buildStops(
  chosen: PresentWalkInput["stops"],
  known: Map<string, Item>,
  origin: { lat: number; lng: number } | null,
  start: Date,
  routesKey: string | null,
  allowTransit: boolean,
): Promise<WalkStop[]> {
  const stops: WalkStop[] = [];
  let cursor = start;
  let previous: { lat: number; lng: number } | null = origin;
  for (const [index, stop] of chosen.entries()) {
    const item = known.get(stop.id)!;
    const leg = previous ? await bestLeg(routesKey, previous, item, cursor, allowTransit) : null;
    // A stop can ask not to start before a set time (dinner from 17:30); the walk waits until then.
    let arrive = notBefore(new Date(cursor.getTime() + (leg?.duration_s ?? 0) * 1000), stop.arrive_after);
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
  // "Oct 21" or "2026-10-21" first; otherwise everyday words like "tomorrow" or "friday" name the day.
  const namedDay = relativeDay(prompt, now);
  const todayKey = torontoDay(now);
  const futureDay = namedDay && (namedDay.year !== todayKey.year || namedDay.month !== todayKey.month || namedDay.day !== todayKey.day) ? namedDay : null;
  const targetDates = requestedDateRange(prompt, now) ?? (futureDay ? dayRange(futureDay.year, futureDay.month, futureDay.day) : null);
  // A named time ("at 12pm", "lunch") sets the start; a named day alone starts at 10 am rather than midnight.
  const askedStart = requestedStart(prompt, now, targetDates ? torontoDay(targetDates.from) : namedDay);
  const clientStart = body.startAt && !Number.isNaN(Date.parse(body.startAt)) && Date.parse(body.startAt) > now.getTime() ? new Date(body.startAt) : null;
  const start = askedStart ?? clientStart ?? (targetDates ? new Date(Math.max(targetDates.from.getTime(), now.getTime())) : now);
  // The time chips win; with "Any time", a duration written in the message ("12 hours") is used instead.
  const chipBudget = typeof body.timeBudgetMinutes === "number" && body.timeBudgetMinutes > 0 ? Math.min(body.timeBudgetMinutes, 16 * 60) : null;
  const budget = chipBudget ?? statedDuration(prompt);
  // Late in the day only the hours until most places close can be planned; the guide says so.
  const leftTonight = targetDates ? null : minutesLeftTonight(start);
  const usable = budget !== null && leftTonight !== null && leftTonight < budget ? Math.max(leftTonight, 0) : budget;
  const end = targetDates?.to ?? new Date(start.getTime() + (usable ?? 6 * 60) * 60_000);
  const origin = isLatLng(body.origin) ? body.origin : null;
  const searchOrigin = origin ?? DOWNTOWN;
  const freeOnly = body.freeOnly === true;
  const travel = body.travel === "walk" || body.travel === "transit" ? body.travel : "flexible";
  const allowTransit = travel !== "walk";
  const spend = parseBudget(body.budgetLimit, body.partySize);
  const perPersonLimit = spend ? spend.limit / spend.people : null;

  const history: Anthropic.Beta.BetaMessageParam[] = (body.history ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.text === "string" && m.text.trim())
    .slice(-4)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 1200) }));
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
        timeBudgetMinutes: usable,
        askedMinutes: budget !== usable ? budget : null,
        freeOnly,
        travel,
        spend,
        requestedDateRange: targetDates?.label ?? null,
        startLabel: askedStart ? torontoLabel(askedStart) : null,
      })}\n\nRequest: ${prompt}`,
    },
  ];

  const client = new Anthropic({ apiKey: anthropicKey });
  const known = new Map<string, Item>();
  let finalText = "";
  let presented: PresentWalkInput | null = null;
  let validatedStops: WalkStop[] | null = null;
  let askedToFill = false;
  // The best walk the guide built but we sent back, used if it runs out of turns before presenting another.
  let fallback: { walk: PresentWalkInput; stops: WalkStop[] } | null = null;
  const longOuting = usable !== null && usable >= LONG_OUTING_MINUTES;
  const maxTurns = longOuting ? LONG_MAX_TURNS : MAX_TURNS;

  try {
    for (let turn = 0; turn < maxTurns && !presented; turn++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4096,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: longOuting ? "medium" : "low" },
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
              const events = await runSearchEvents(db, input, {
                origin: searchOrigin,
                fromIso: (targetDates?.from ?? now).toISOString(),
                endIso: end.toISOString(),
                freeOnly,
                requestedDates: targetDates !== null,
                perPersonLimit,
              }).then((found) => (perPersonLimit === null ? found : found.filter((e) => fitsPerPerson(e, perPersonLimit))));
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
                radiusMeters: typeof input.radius_m === "number" ? input.radius_m : 1200,
                maxPrice: freeOnly ? "inexpensive" : ((["inexpensive", "moderate", "expensive", "any"] as const).find((p) => p === input.max_price) ?? "any") as MaxPrice,
                openNow: input.open_now === true,
                // A spend limit filters results afterwards, so ask Google for more to keep enough that fit.
                limit: perPersonLimit !== null ? 10 : typeof input.limit === "number" ? Math.min(Math.max(1, input.limit), 10) : 6,
              });
              const filtered = freeOnly
                ? places.filter((p) => p.is_free)
                : perPersonLimit !== null
                  ? places.filter((p) => fitsPerPerson(p, perPersonLimit))
                  : places;
              filtered.forEach((p) => known.set(p.id, p)); // kept in memory for this request only: Google's policy does not allow storing Places content beyond place IDs
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
              if (spend) {
                const check = checkBudget(
                  walk.stops.map((s) => known.get(s.id)!).map((item) => ({ ...item, name: item.kind === "event" ? item.title : item.name })),
                  spend.limit,
                  spend.people,
                );
                if (!check.fits) {
                  const why = check.unknown.length
                    ? `These stops have no listed price, so they can't be counted against the budget: ${check.unknown.join("; ")}.`
                    : `The listed prices add up to $${check.total} for ${spend.people === 1 ? "one person" : `${spend.people} people`}, over the $${spend.limit} limit.`;
                  return {
                    type: "tool_result",
                    tool_use_id: tool.id,
                    content: `${why} Swap the priciest stop for a free or cheaper one from your searches, or drop it and present a shorter walk.`,
                    is_error: true,
                  };
                }
              }
              const candidateStops = await buildStops(walk.stops.slice(0, 8), known, origin, start, placesKey, allowTransit);
              // Moving on to a new part of the day (or to a timed meal) may take longer than a hop within one area.
              const longHops = candidateStops.slice(1).filter((stop, i) => {
                const prev = candidateStops[i];
                const newPart = Boolean(walk.stops[i + 1]?.arrive_after) || dayPart(new Date(prev.leave_at)) !== dayPart(new Date(stop.arrive_at));
                return stop.leg && stop.leg.duration_s > (newPart ? MAX_PART_CHANGE_TRAVEL_SECONDS : MAX_INTERSTOP_TRAVEL_SECONDS);
              });
              if (longHops.length) {
                // Keep the part before the first long hop as a fallback; its intro may mention later stops, so it gets a plain one.
                const cut = candidateStops.indexOf(longHops[0]);
                if (cut >= 2 && (!fallback || cut > fallback.stops.length)) {
                  fallback = {
                    walk: { ...walk, intro: "Honk! Here's what I could fit together without long trips between stops.", stops: walk.stops.slice(0, cut) },
                    stops: candidateStops.slice(0, cut),
                  };
                }
                const details = longHops.map((stop) => `${stop.item.kind === "event" ? stop.item.title : stop.item.name} (${Math.ceil((stop.leg!.duration_s) / 60)} min from the previous stop)`).join("; ");
                return {
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: `This route exceeds the travel limit (20 minutes between stops, 40 when moving to a new part of the day or a timed meal): ${details}. Keep the requested anchor and order, then search for a nearby replacement within 800–1200 m of the preceding stop. Prefer highly rated places with substantial review counts. If no suitable nearby replacement exists, omit that stop and present a shorter walk.`,
                  is_error: true,
                };
              }
              // Time actually spent (stays and travel); waiting for a timed stop doesn't count as filled.
              const walkMinutes = Math.round(candidateStops.reduce((sum, stop) => sum + stop.stay_minutes + (stop.leg?.duration_s ?? 0) / 60, 0));
              if (!askedToFill && leavesTooMuchTime(walkMinutes, usable, candidateStops.length)) {
                askedToFill = true; // only once, so a thin area still gets a walk
                if (!fallback || candidateStops.length >= fallback.stops.length) fallback = { walk, stops: candidateStops };
                return {
                  type: "tool_result",
                  tool_use_id: tool.id,
                  content: `This walk only fills about ${walkMinutes} of the ${usable} minutes with stops and travel (waiting doesn't count). Add free stops near these ones (park, waterfront, plaza, library, garden, viewpoint, free gallery) with search_places, then present again. If nothing suitable is nearby, present the same stops again and say plainly in the intro that it's a shorter outing. Keep the intro to the stops in the walk.`,
                  is_error: true,
                };
              }
              validatedStops = candidateStops;
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
      if (!presented) {
        const turnsLeft = maxTurns - 1 - turn;
        const nudge: Anthropic.Beta.BetaTextBlockParam[] =
          turnsLeft <= WRAP_UP_TURNS_LEFT
            ? [{ type: "text", text: "You are almost out of turns. Call present_walk now with the best stops you have already found (a shorter walk is fine). Do not search again." }]
            : [];
        messages.push({ role: "user", content: [...results, ...nudge] });
      }
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

  // Assigned inside the tool callbacks, so TypeScript can't see that it may be set here.
  const leftover = fallback as { walk: PresentWalkInput; stops: WalkStop[] } | null;
  if (!presented && leftover) {
    console.warn("out of turns; presenting the fallback walk", { stops: leftover.stops.length });
    presented = leftover.walk;
    validatedStops = leftover.stops;
  }
  if (!presented) {
    console.warn("no walk presented", { turns: messages.length, hadText: finalText !== "", known: known.size });
    return json({ message: finalText || "Honk? Tell me a bit more — what are you in the mood for?", walk: null });
  }

  const chosen = (presented as PresentWalkInput).stops.slice(0, 8);
  const stops = validatedStops ?? await buildStops(chosen, known, origin, start, placesKey, allowTransit);
  // Google review content is transient evidence for ranking; keep only the
  // permanent place ID and derived recommendation in the stored walk.
  const safeStops = stops.map((stop) => {
    if (stop.item.kind !== "place") return stop;
    const place = { ...stop.item };
    delete place.review_evidence;
    return { ...stop, item: place };
  });
  const lastLeave = safeStops.length ? new Date(safeStops[safeStops.length - 1].leave_at) : start;
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
    stops: safeStops,
    total_minutes: Math.round((lastLeave.getTime() - start.getTime()) / 60_000),
    created_at: new Date().toISOString(),
  };
  const { error: saveError } = await db.from("walks").insert(walk);
  if (saveError) console.error("walk save failed", saveError.message);

  return json({ message: walk.intro, walk });
});
