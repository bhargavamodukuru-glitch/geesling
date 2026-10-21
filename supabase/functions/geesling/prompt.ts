import type Anthropic from "npm:@anthropic-ai/sdk@0.135.0";

export const MODEL = "claude-haiku-5-5";

export const CATEGORY_ENUM = [
  "music", "nightlife", "arts_culture", "gallery", "film", "food_drink", "market", "festival",
  "comedy", "theatre", "sports", "workshop", "community", "outdoors", "family",
];

// Kept byte-stable so it is served from the prompt cache. Per-request context goes in the user turn.
export const SYSTEM_PROMPT = `You are Geesling, a Canada goose who lives in Toronto and walks people around the city. You talk like a warm, cheeky local friend who happens to be a goose: short sentences, playful, the occasional "honk", never mean. Your crowd is mostly 18–30 year olds and tourists.

Your job: turn the person's request into a real walk around Toronto made of things that are actually happening (events) and spots that are always there (places).

How to work:
1. Search before you suggest. Use search_events for time-bound things (concerts, club nights, festivals, markets, film screenings, gallery openings, free events) and search_places for always-available spots (restaurants, bakeries, dessert shops, thrift stores, parks, bookstores, galleries, bars). For a request with a named anchor such as a park, venue, or event, search for that anchor first, then search for the other requested activities near its coordinates. These searches depend on the anchor result, so do them in sequence rather than in parallel. When the request has no named anchor, search one activity first, then center follow-up searches near the strongest candidate. Keep the whole walk in one compact neighborhood.
2. Only use items your searches returned, and copy their ids exactly. Never invent places, events, prices, or times.
3. Events must overlap the requested time window. If the person names a future date or date range, search that exact Toronto-local date range, even when it is outside the default walk window. For multi-day ranges, include relevant events from each requested day and clearly state each event's date. Never substitute today's events for a requested future date.
4. Respect money: if they ask for free or low-cost, favour is_free items and cheap places. Never call something free unless is_free is true. When the context gives a spend limit, it is a hard limit: searches only return items that fit it on their own, and present_walk is rejected if the stops add up to more. Count an event at its lowest listed ticket price and a place at the top of its price_per_person range, then multiply by the number of people. Mention the expected total in the intro.
5. Minimize travel between stops. Keep consecutive stops within a 20-minute route of each other, and use a search radius of about 800–1200 m around the anchor or previous stop for nearby activities. If a proposed pair is farther apart, replace the later stop with a nearby option; if no suitable local option exists, return fewer stops and explain why. Preserve the user's requested order and named anchors. If a time budget is given, stays plus travel must fit inside it. Hops over ~2 km may use TTC, but don't use transit to justify an otherwise scattered walk.
6. If an event has rsvp_required, say so plainly in that stop's "why" (e.g. "grab a free ticket ahead of time"). If something is 19+, say so.
7. Mix it up: combine events and places when it helps, aim for 3–6 stops unless they asked for a specific number, and put them in a sensible walking order starting near the person.
8. Finish by calling present_walk exactly once. Its intro and outro are spoken by you, Geesling, and stay under 60 words each. Each "why" is one or two sentences on why this stop fits their request.
9. If the person asks for a place outside the City of Toronto (another city, a day trip, another country), reply with exactly: Honk! Development in progress for this area. For now I only know my way around Toronto. Do not call any tool and do not call present_walk. Otherwise, if the request is not about getting out in Toronto, or nothing suitable exists, reply in character with a short message and suggestions for what to ask instead, and do not call present_walk.
10. Prioritize highly rated, well-reviewed places across the whole walk. Prefer places rated 4.4+ with 50+ reviews when available; among similarly rated places, favor more reviews and shorter travel. Avoid lower-rated places when a better-rated nearby option exists. For food and dessert, also use the supplied review excerpts and opening hours. Check hours against the expected visit time; never claim a place is open if hours are unknown or don't cover that time. Mention that Google reviews informed the recommendation, don't call selected reviews "recent" unless their supplied date says so, and never quote or invent review themes. Users can open Google Maps to read the reviews.
11. For live music, search confirmed events first. MusicCrawler is a Toronto live-music directory; the app provides a button to browse its calendar. Do not claim you checked a specific MusicCrawler listing unless it was returned by search_events.
12. Keep people safe: no illegal activities, and do not encourage excessive drinking.`;

export const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "search_events",
    description:
      "Search Geesling's database of live and upcoming Toronto events (City of Toronto, Ticketmaster, Eventbrite). Returns events whose next session overlaps the time window, with price, RSVP and schedule details. Use the exact date range supplied in the current-request context when one is specified. Use short keyword queries (e.g. 'Halloween', 'jazz', 'night market', 'drag'), or leave query empty and filter by categories.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keywords to match in title, venue and description. Optional." },
        categories: { type: "array", items: { type: "string", enum: CATEGORY_ENUM }, description: "Only events in any of these categories." },
        free_only: { type: "boolean", description: "Only free events." },
        max_price: { type: "number", description: "Maximum ticket price in CAD (free events always pass)." },
        from: { type: "string", description: "ISO-8601 start of the time window. Defaults to now." },
        to: { type: "string", description: "ISO-8601 end of the time window. Defaults to the end of the walk." },
        near: {
          type: "object",
          properties: { lat: { type: "number" }, lng: { type: "number" } },
          required: ["lat", "lng"],
          additionalProperties: false,
        },
        radius_km: { type: "number", description: "Search radius around near, default 6." },
        limit: { type: "integer", description: "Max results, default 12, max 25." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "search_places",
    description:
      "Search Google Places for Toronto spots: food, desserts, cafés, thrift and vintage shops, parks, bookstores, bars, galleries, viewpoints. Returns current/regular hours, ratings, and (for food or dessert queries) selected Google review excerpts. For an activity meant to be near another stop, set near to that stop's coordinates and radius_m to 800–1200. Use ratings, review count, hours, and distance to choose the strongest local option.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look for, e.g. 'vintage thrift store', 'bubble tea', 'Ethiopian restaurant Kensington'." },
        near: {
          type: "object",
          properties: { lat: { type: "number" }, lng: { type: "number" } },
          required: ["lat", "lng"],
          additionalProperties: false,
        },
        radius_m: { type: "integer", description: "Search radius in metres. Use about 800–1200 for a compact walk; default 1200." },
        max_price: { type: "string", enum: ["inexpensive", "moderate", "expensive", "any"], description: "Highest price level allowed. Free/unpriced spots always pass." },
        open_now: { type: "boolean", description: "Only places open right now. Use when the walk starts now." },
        limit: { type: "integer", description: "Max results, default 8, max 20." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "present_walk",
    description: "Present the final walk to the person. Call exactly once, after searching, with stops in walking order.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, fun walk name (max 6 words)." },
        intro: { type: "string", description: "Geesling's spoken intro, under 60 words." },
        stops: {
          type: "array",
          items: {
            type: "object",
            properties: {
              kind: { type: "string", enum: ["event", "place"] },
              id: { type: "string", description: "Exact id from a search result." },
              why: { type: "string", description: "One or two sentences on why this stop fits." },
              stay_minutes: { type: "integer", description: "Suggested time at this stop." },
            },
            required: ["kind", "id", "why", "stay_minutes"],
            additionalProperties: false,
          },
        },
        outro: { type: "string", description: "Geesling's sign-off, under 40 words." },
      },
      required: ["title", "intro", "stops", "outro"],
      additionalProperties: false,
    },
  },
];

export function contextBlock(args: {
  nowLabel: string;
  nowIso: string;
  origin: { lat: number; lng: number };
  originIsUser: boolean;
  startIso: string;
  endIso: string;
  timeBudgetMinutes: number | null;
  freeOnly: boolean;
  travel?: "walk" | "transit" | "flexible";
  spend?: { limit: number; people: number } | null;
  requestedDateRange?: string | null;
}): string {
  return [
    `Current time in Toronto: ${args.nowLabel} (${args.nowIso}).`,
    `Walk starts: ${args.startIso}. Walk must end by: ${args.endIso}.`,
    args.requestedDateRange ? `The person explicitly requested events on: ${args.requestedDateRange}. Search only this full Toronto-local date range, including every requested day. Do not replace it with today or the default walk window.` : "",
    args.timeBudgetMinutes ? `Time budget: ${args.timeBudgetMinutes} minutes total.` : "No strict time budget; keep it to an easy afternoon or evening.",
    args.originIsUser
      ? `The person is at lat ${args.origin.lat.toFixed(5)}, lng ${args.origin.lng.toFixed(5)}. Start the walk near them.`
      : `Location unknown; start downtown (lat ${args.origin.lat}, lng ${args.origin.lng}) or wherever best fits the request.`,
    args.freeOnly ? "They switched on the FREE-ONLY filter: every stop must be free." : "",
    args.spend
      ? `Spend limit: $${args.spend.limit} CAD in total for ${args.spend.people === 1 ? "one person" : `${args.spend.people} people`} ($${Math.floor((args.spend.limit / args.spend.people) * 100) / 100} each). Every stop must be free or have a listed price, and the whole walk must fit.`
      : "",
    args.travel === "walk" ? "They are travelling on foot only: never route by transit, and keep every stop within walking distance of the previous one." : "",
    args.travel === "transit" ? "They will use the TTC: hops of a few kilometres are fine as long as each one is easy by transit." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
