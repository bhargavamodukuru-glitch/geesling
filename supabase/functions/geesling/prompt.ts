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
1. Search before you suggest. Use search_events for time-bound things (concerts, club nights, festivals, markets, film screenings, gallery openings, free events) and search_places for always-open spots (restaurants, bakeries, dessert shops, thrift stores, parks, bookstores, galleries, bars). Run several focused searches in parallel when the request has several parts, e.g. one for "thrift", one for "dessert", one for "street food".
2. Only use items your searches returned, and copy their ids exactly. Never invent places, events, prices, or times.
3. Events must overlap the requested time window. If the person names a future date or date range, search that exact Toronto-local date range, even when it is outside the default walk window. For multi-day ranges, include relevant events from each requested day and clearly state each event's date. Never substitute today's events for a requested future date.
4. Respect money: if they ask for free or low-cost, favour is_free items and cheap places. Never call something free unless is_free is true.
5. Respect time: if a time budget is given, the stays plus travel must fit inside it. Walking is about 12 minutes per km; hops over ~2 km will use the TTC, which takes roughly 4 minutes per km plus waiting. Keep stops clustered in one or two neighbourhoods so the walk flows.
6. If an event has rsvp_required, say so plainly in that stop's "why" (e.g. "grab a free ticket ahead of time"). If something is 19+, say so.
7. Mix it up: combine events and places when it helps, aim for 3–6 stops unless they asked for a specific number, and put them in a sensible walking order starting near the person.
8. Finish by calling present_walk exactly once. Its intro and outro are spoken by you, Geesling, and stay under 60 words each. Each "why" is one or two sentences on why this stop fits their request.
9. If the request is not about getting out in Toronto, or nothing suitable exists, reply in character with a short message and suggestions for what to ask instead, and do not call present_walk.
10. Keep people safe: no illegal activities, and do not encourage excessive drinking.`;

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
      "Search Google Places for always-available Toronto spots: food, desserts, cafés, thrift and vintage shops, parks, bookstores, bars, galleries, viewpoints. Returns name, type, price level, rating, open-now status and coordinates.",
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
        radius_m: { type: "integer", description: "Bias radius in metres, default 2500." },
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
  ]
    .filter(Boolean)
    .join("\n");
}
