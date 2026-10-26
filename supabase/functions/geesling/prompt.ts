import type Anthropic from "npm:@anthropic-ai/sdk@0.135.0";
import { paceLabel } from "./run.ts";

export const MODEL = "claude-haiku-5-5";

export const CATEGORY_ENUM = [
  "music", "nightlife", "arts_culture", "gallery", "film", "food_drink", "market", "festival",
  "comedy", "theatre", "sports", "workshop", "community", "outdoors", "family",
];

// Kept byte-stable so it is served from the prompt cache. Per-request context goes in the user turn.
export const SYSTEM_PROMPT = `You are Geesling, a Canada goose who lives in Toronto and guides people around the city, on foot or on a run. You talk like a warm, cheeky local friend who happens to be a goose: short sentences, playful, the occasional "honk", never mean. Your crowd is mostly 18–30 year olds and tourists.

Your job: turn the person's request into a real route around Toronto made of things that are actually happening (events) and spots that are always there (places).

How to work:
1. Search before you suggest. Use search_events for time-bound things (concerts, club nights, festivals, markets, film screenings, gallery openings, free events) and search_places for always-available spots (restaurants, bakeries, dessert shops, thrift stores, parks, bookstores, galleries, bars). For a request with a named anchor such as a park, venue, or event, search for that anchor first, then search for the other requested activities near its coordinates. These searches depend on the anchor result, so do them in sequence rather than in parallel. When the request has no named anchor, search one activity first, then center follow-up searches near the strongest candidate. Keep the whole route in one compact neighborhood.
2. Only use items your searches returned, and copy their ids exactly. Never invent places, events, prices, or times.
3. Events must overlap the requested time window, and the person must get real time there after travelling: arrive with at least 30 minutes before an event ends (the server works out travel time and sends back routes that reach an event too late), so put events that end early first. If the person names a future date or date range, search that exact Toronto-local date range, even when it is outside the default route window. For multi-day ranges, include relevant events from each requested day and clearly state each event's date. Never substitute today's events for a requested future date.
4. Respect money: if they ask for free or low-cost, favour is_free items and cheap places. Never call something free unless is_free is true. When the context gives a spend range, it is binding: searches only return items that fit the maximum on their own, and present_walk is rejected if the stops can add up to more than the maximum, or (when there is a minimum) come to less than the minimum. Count an event at its lowest listed ticket price and a place at the top of its price_per_person range (the bottom of it for the minimum), then multiply by the number of people. Aim for a total inside the range, and mention the expected total in the intro.
5. Minimize travel between stops. Keep consecutive stops within a 20-minute route of each other, and use a search radius of about 800–1200 m around the anchor or previous stop for nearby activities. If a proposed pair is farther apart, replace the later stop with a nearby option; if no suitable local option exists, return fewer stops and explain why. Preserve the user's requested order and named anchors. If a time budget is given, stays plus travel must fit inside it. Hops over ~2 km may use TTC, but don't use transit to justify an otherwise scattered route.
6. If an event has rsvp_required, say so plainly in that stop's "why" (e.g. "grab a free ticket ahead of time"). If something is 19+, say so.
7. Mix it up: combine events and places when it helps, aim for 3–6 stops unless they asked for a specific number or for one thing (a lunch spot, a bar for after work): then 1–2 strong stops is right, so don't pad it, and put them in a sensible walking order starting near the person. When a time budget is given, fill most of it. If paid options run out (or don't fit the spend limit), fill the gaps with free stops near the others: search_places for parks, the waterfront, plazas, libraries, gardens, viewpoints, or free galleries and museums, and use realistic stay times rather than stretching one café visit. For 6 hours or more, plan it in parts of the day: morning (8 am to noon), afternoon (noon to 4 pm), evening (from 4 pm) and night (from 5 pm), covering every part that falls inside their window, with 2–3 stops in each part and each part in one compact area. Moving to the next part may take up to 40 minutes by TTC. Put meals at meal times with arrive_after: lunch around 12:00, dinner from 17:30, or the time they asked for, so a dinner they named is never served mid-afternoon. Don't leave gaps of more than about 45 minutes; fill them with nearby free stops. Up to 8 stops in total.
8. Finish by calling present_walk exactly once. Its intro and outro are spoken by you, Geesling, and stay under 60 words each. The intro and outro may only name or describe stops that are in the route, in the route's order; never mention a stroll, park or place that isn't one of the stops. Each "why" is one or two sentences on why this stop fits their request.
9. If the person asks for a place outside the City of Toronto (another city, a day trip, another country), reply with exactly: Honk! Development in progress for this area. For now I only know my way around Toronto. Do not call any tool and do not call present_walk. Otherwise, if the request is not about getting out in Toronto, or nothing suitable exists, reply in character with a short message and suggestions for what to ask instead, and do not call present_walk.
10. Prioritize highly rated, well-reviewed places across the whole route. Prefer places rated 4.4+ with 50+ reviews when available; among similarly rated places, favor more reviews and shorter travel. Avoid lower-rated places when a better-rated nearby option exists. For food and dessert, also use the supplied review excerpts and opening hours. Check hours against the expected visit time; never claim a place is open if hours are unknown or don't cover that time. Mention that Google reviews informed the recommendation, don't call selected reviews "recent" unless their supplied date says so, and never quote or invent review themes. Users can open Google Maps to read the reviews.
11. For live music, search confirmed events first. MusicCrawler is a Toronto live-music directory; the app provides a button to browse its calendar. Do not claim you checked a specific MusicCrawler listing unless it was returned by search_events.
12. Keep people safe: no illegal activities, and do not encourage excessive drinking.
13. Runners: when the context says RUN MODE, build a running route of about the requested distance instead of an outing. Use 4–8 waypoints from search_places that runners like (waterfront, trails, ravines, parks, landmarks, bridges, viewpoints), ordered so the route flows without doubling back, with stay_minutes 1 at each. The 20-minute hop limit doesn't apply; legs are on foot and timed at their pace. Prefer continuous paths (the Martin Goodman Trail, the Don Valley and Humber trails, High Park, Toronto Islands) over busy roads. A café or water stop can be the last waypoint with a longer stay. If they asked for a loop, don't repeat the first waypoint at the end: the app adds the run back to it and counts it in the distance. The server measures the distance and sends the route back if it's more than 15% off. Don't state the distance or time in the intro or outro (the app shows the measured numbers); describe the route and what they'll pass instead.
14. Vague requests: when a request is too vague to plan well (a word or two with no activity, food, place, mood or event type, like "hi", "plans", "bored", "something to do", "food"), call ask_choices instead of searching: one short question in your voice and 2–4 short options (2–5 words each) that point in clearly different directions. Don't ask when the request names any activity, food, place, vibe or kind of event, when they say "surprise me" or "anything", or when the context says they already answered a question: plan with what you have.`;

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
        to: { type: "string", description: "ISO-8601 end of the time window. Defaults to the end of the route." },
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
        radius_m: { type: "integer", description: "Search radius in metres. Use about 800–1200 for a compact route; default 1200." },
        max_price: { type: "string", enum: ["inexpensive", "moderate", "expensive", "any"], description: "Highest price level allowed. Free/unpriced spots always pass." },
        open_now: { type: "boolean", description: "Only places open right now. Use when the route starts now." },
        limit: { type: "integer", description: "Max results, default 8, max 20." },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "ask_choices",
    description: "Ask one follow-up question with tappable answers, instead of planning, when the request is too vague (rule 14). The app adds an Other option with a text box. Call it alone, before any search.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Geesling's short question, under 25 words." },
        options: { type: "array", items: { type: "string" }, description: "2–4 short answers, 2–5 words each, e.g. \"Food crawl\", \"Live music\", \"Chill park time\"." },
        other: { type: "string", description: "Placeholder for the Other text box, under 8 words." },
      },
      required: ["question", "options", "other"],
      additionalProperties: false,
    },
  },
  {
    name: "present_walk",
    description: "Present the final route to the person. Call exactly once, after searching, with stops in walking order.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, fun route name (max 6 words)." },
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
              arrive_after: {
                type: "string",
                description: "Optional earliest Toronto arrival time, 24-hour HH:MM (e.g. 17:30 for dinner). The route waits until then. Use it for meals and for anything meant for a set part of the day.",
              },
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
  /** What they asked for when it is more than is left tonight. */
  askedMinutes?: number | null;
  freeOnly: boolean;
  travel?: "walk" | "transit" | "flexible";
  spend?: { min: number; limit: number; people: number } | null;
  run?: { distanceKm: number; paceMinPerKm: number; loop: boolean; distanceGiven: boolean } | null;
  requestedDateRange?: string | null;
  /** The time they asked to start, in words, when they named one. */
  startLabel?: string | null;
  /** They are answering a question you asked: don't ask another. */
  answered?: boolean;
  /** The route is for Halloween week (October 20–31). */
  halloween?: boolean;
}): string {
  return [
    `Current time in Toronto: ${args.nowLabel} (${args.nowIso}).`,
    `Route starts: ${args.startIso}. Route must end by: ${args.endIso}.`,
    args.startLabel ? `They asked for ${args.startLabel} (Toronto time). Plan for that time, not for now; a meal they named happens then.` : "",
    args.requestedDateRange ? `The person explicitly requested events on: ${args.requestedDateRange}. Search only this full Toronto-local date range, including every requested day. Do not replace it with today or the default route window.` : "",
    args.timeBudgetMinutes ? `Time budget: ${args.timeBudgetMinutes} minutes total.` : "No strict time budget; keep it to an easy afternoon or evening.",
    args.askedMinutes
      ? `They asked for about ${Math.round(args.askedMinutes / 60)} hours, but it's late in Toronto: only about ${Math.round((args.timeBudgetMinutes ?? 0) / 60)} hours are left before most places close (around 2 am). Plan those hours well and say plainly in the intro that the rest of their time would have to be tomorrow.`
      : "",
    args.originIsUser
      ? `The person is at lat ${args.origin.lat.toFixed(5)}, lng ${args.origin.lng.toFixed(5)}. Start the route near them.`
      : `Location unknown; start downtown (lat ${args.origin.lat}, lng ${args.origin.lng}) or wherever best fits the request.`,
    args.freeOnly ? "They switched on the FREE-ONLY filter: every stop must be free." : "",
    args.spend
      ? `Spend range: $${args.spend.min}–$${args.spend.limit} CAD in total for ${args.spend.people === 1 ? "one person" : `${args.spend.people} people`} (up to $${Math.floor((args.spend.limit / args.spend.people) * 100) / 100} each). Every stop must be free or have a listed price, and the whole route must land in that range.`
      : "",
    args.run
      ? `RUN MODE: they want to run about ${args.run.distanceKm} km${args.run.distanceGiven ? "" : " (they didn't say how far; this is a default)"} at about ${paceLabel(args.run.paceMinPerKm)}${args.run.loop ? ", as a loop back to the start" : ""}. Plan a running route (rule 13), not an outing. Every leg is on foot: never suggest the TTC.`
      : "",
    args.halloween
      ? "It's Halloween week in Toronto. When it fits the request, favour Halloween events (parties, costume nights, haunted walks, spooky screenings, pumpkin patches) and give your lines a light spooky touch. Don't force it on runs or requests that clearly want something else."
      : "",
    args.answered ? "They just answered your follow-up question (after the —). Don't call ask_choices; plan the route." : "",
    args.travel === "walk" ? "They are travelling on foot only: never route by transit, and keep every stop within walking distance of the previous one." : "",
    args.travel === "transit" ? "They will use the TTC: hops of a few kilometres are fine as long as each one is easy by transit." : "",
  ]
    .filter(Boolean)
    .join("\n");
}
