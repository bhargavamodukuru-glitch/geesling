// Geesling's three daily emails, to people who ticked "Send me Geesling updates" (profiles.marketing_opt_in):
//   9 am  morning        what's on today, free picks from Geesling's events
//   noon  neighbourhood  "A day in <area> under $20": a café, free stops, lunch, an optional evening extra
//   5 pm  evening        grab-and-go food under $20, live from Google Places (fetched at send time; Google's terms
//                        don't allow storing it), credited to Google Maps
// Sent with Resend from Geesling <hello@news.geesling.ca>, replies to the contact address. Each send uses an
// idempotency key per kind, day and batch, so a late or repeated schedule never sends twice. Every email carries a
// signed one-click unsubscribe link (and the List-Unsubscribe headers Gmail and Yahoo require), handled by
// supabase/functions/email-unsubscribe.
// Called by .github/workflows/daily-emails.yml with the service-role key:
//   POST /functions/v1/daily-emails                 → whichever email is due now in Toronto, if any
//   ...?kind=neighbourhood                          → that email now
//   ...&dry=1                                       → returns the rendered email, sends nothing
//   ...&test=1                                      → sends only to EMAIL_TEST_TO (the owner), not subscribers
import { createClient } from "npm:@supabase/supabase-js@2.95.3";

// deno-lint-ignore no-explicit-any
type Db = any; // the service-role client; untyped like the other functions here
import { CONTACT_EMAIL, renderEmail, renderPictureEmail, renderSnapshotPage, type EmailContent } from "./template.ts";
import {
  EVENING_AREAS,
  NEIGHBOURHOODS,
  areaBox,
  composeEvening,
  composeMorning,
  composeNeighbourhood,
  dayNumber,
  dueEmail,
  inArea,
  inToronto,
  pickFreeEvents,
  sessionIn,
  worthPicking,
  type Area,
  type EmailKind,
  type EventRow,
  type PlaceRow,
  type SpotRow,
} from "./picks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_KEY = Deno.env.get("RESEND_SEND_KEY") ?? "";
const PLACES_KEY = Deno.env.get("GOOGLE_MAPS_SERVER_KEY") ?? "";
const UNSUB_SECRET = Deno.env.get("EMAIL_UNSUB_SECRET") ?? "";
const TEST_TO = Deno.env.get("EMAIL_TEST_TO") ?? CONTACT_EMAIL;
const FROM = "Geesling <hello@news.geesling.ca>";
const BUDGET = 20;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function isServiceRole(request: Request): boolean {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token && token === SERVICE_KEY) return true;
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

function toronto(now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const dateText = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" }).format(now);
  // Toronto midnight tonight, as a UTC instant (offset read from the zone).
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Toronto", timeZoneName: "longOffset" }).formatToParts(now).find((p) => p.type === "timeZoneName")?.value ?? "GMT-05:00";
  const midnight = new Date(`${day}T23:59:59${offset.replace("GMT", "") || "-05:00"}`);
  return { hour: Number(parts.hour), month: Number(parts.month), day, dateText, midnight };
}

/** Signed unsubscribe link for one account (HMAC-SHA256, checked by email-unsubscribe). */
export async function unsubscribeUrl(owner: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(UNSUB_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(owner)));
  const token = btoa(String.fromCharCode(...sig.slice(0, 18))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${SUPABASE_URL}/functions/v1/email-unsubscribe?u=${encodeURIComponent(owner)}&t=${token}`;
}

/** Cheap, well-reviewed places from Google Places Text Search, inside a box or near a point. */
async function searchPlaces(query: string, area: Area, opts: { boxScale: number; openNow?: boolean; minReviews: number; maxPrice: number }): Promise<PlaceRow[]> {
  const b = areaBox(area, opts.boxScale);
  const body: Record<string, unknown> = {
    textQuery: `${query}, Toronto`,
    pageSize: 12,
    priceLevels: ["PRICE_LEVEL_INEXPENSIVE"],
    minRating: 4.3,
    ...(opts.openNow ? { openNow: true } : {}),
    // Restricted to a box around the area (a bias alone let downtown results into "the east end").
    locationRestriction: { rectangle: { low: { latitude: b.south, longitude: b.west }, high: { latitude: b.north, longitude: b.east } } },
  };
  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.shortFormattedAddress,places.primaryTypeDisplayName,places.priceRange,places.businessStatus",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Places ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const data = (await response.json()) as { places?: Array<Record<string, any>> };
  return (data.places ?? [])
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY" && (p.userRatingCount ?? 0) >= opts.minReviews)
    .map((p): PlaceRow => {
      const lo = Number(p.priceRange?.startPrice?.units);
      const hi = Number(p.priceRange?.endPrice?.units);
      return {
        name: String(p.displayName?.text ?? "").trim(),
        address: String(p.shortFormattedAddress ?? "").replace(/, Toronto$/, ""),
        rating: Number(p.rating ?? 0),
        reviews: Number(p.userRatingCount ?? 0),
        price: Number.isFinite(lo) && Number.isFinite(hi) && hi > 0 ? [lo, hi] : null,
        kindLabel: String(p.primaryTypeDisplayName?.text ?? ""),
      };
    })
    .filter((p) => p.name && (!p.price || p.price[1] <= opts.maxPrice));
}

const EVENT_COLUMNS = "title,venue_name,address,lat,lng,is_free,price_min,categories,quality_score,schedule";

async function eventsOnToday(db: Db, now: Date, midnight: Date, filter: { freeOnly?: boolean; area?: Area }): Promise<EventRow[]> {
  const out: EventRow[] = [];
  for (let from = 0; from < 5000; from += 1000) {
    let q = db.from("events").select(EVENT_COLUMNS).gt("last_end_at", now.toISOString()).lt("first_start_at", midnight.toISOString());
    if (filter.freeOnly) q = q.eq("is_free", true);
    if (filter.area) {
      const b = areaBox(filter.area);
      q = q.gte("lat", b.south).lte("lat", b.north).gte("lng", b.west).lte("lng", b.east);
    }
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function spotsIn(db: Db, area: Area, month: number): Promise<SpotRow[]> {
  const b = areaBox(area);
  const kinds = month >= 9 && month <= 11 ? ["fall_colours", "stroll", "art"] : ["stroll", "art"];
  const { data, error } = await db.from("city_spots").select("kind,name,address,lat,lng").in("kind", kinds).gte("lat", b.south).lte("lat", b.north).gte("lng", b.west).lte("lng", b.east).limit(60);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<SpotRow & { lat: number; lng: number }>;
  // Seasonal colour first, then strolls, then public art; nearest the centre within each.
  const rank = (k: string) => kinds.indexOf(k);
  const dist = (s: { lat: number; lng: number }) => Math.hypot(s.lat - area.lat, (s.lng - area.lng) * 0.72);
  return rows.sort((x, y) => rank(x.kind) - rank(y.kind) || dist(x) - dist(y));
}

async function buildContent(kind: EmailKind, now: Date): Promise<EmailContent> {
  const t = toronto(now);
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const label = (h: string) => `${t.dateText} · ${h}`;

  if (kind === "morning") {
    const free = (await eventsOnToday(db, now, t.midnight, { freeOnly: true })).filter((e) => inToronto(e) && sessionIn(e, now, t.midnight));
    const picks = pickFreeEvents(free, now, t.midnight, t.month);
    return composeMorning({ dateLabel: label("9 AM"), freeCount: free.length, picks, now });
  }

  if (kind === "evening") {
    const area = EVENING_AREAS[dayNumber(t.day) % EVENING_AREAS.length];
    const [bites, dinner, coffee] = await Promise.all([
      searchPlaces("cheap quick bites takeout", area, { boxScale: 2.2, openNow: true, minReviews: 250, maxPrice: 20 }),
      searchPlaces("affordable dinner restaurant", area, { boxScale: 2.2, openNow: true, minReviews: 250, maxPrice: 20 }),
      searchPlaces("cafe coffee to go", area, { boxScale: 2.2, openNow: true, minReviews: 150, maxPrice: 10 }),
    ]);
    // No place twice across sections. The two food searches often return the same spots, so each section takes
    // the next unused ones from its own results first, then from the other's.
    const seen = new Set<string>();
    const take = (...lists: PlaceRow[][]) => {
      const out: PlaceRow[] = [];
      for (const p of lists.flat()) {
        if (out.length === 2) break;
        if (seen.has(p.name)) continue;
        seen.add(p.name);
        out.push(p);
      }
      return out;
    };
    const quick = take(bites);
    const meals = take(dinner, bites);
    return composeEvening({ dateLabel: label("5 PM"), areaName: area.name, bites: quick, dinner: meals, coffee: take(coffee) });
  }

  // Neighbourhood day: the next area in rotation with at least two free things to do there today.
  const spotCache = new Map<string, SpotRow[]>();
  const eventCache = new Map<string, EventRow[]>();
  let chosen: Area | null = null;
  for (let i = 0; i < NEIGHBOURHOODS.length && !chosen; i++) {
    const a = NEIGHBOURHOODS[(dayNumber(t.day) + i) % NEIGHBOURHOODS.length];
    const [spots, events] = await Promise.all([spotsIn(db, a, t.month), eventsOnToday(db, now, t.midnight, { area: a })]);
    spotCache.set(a.name, spots);
    eventCache.set(a.name, events.filter((e) => inArea(a, e.lat, e.lng) && inToronto(e)));
    if (eventCache.get(a.name)!.filter((e) => e.is_free).length + spots.length >= 2) chosen = a;
  }
  const area = chosen ?? NEIGHBOURHOODS[dayNumber(t.day) % NEIGHBOURHOODS.length];
  const events = eventCache.get(area.name) ?? [];
  const spots = spotCache.get(area.name) ?? [];
  const freeEvents = pickFreeEvents(events.filter((e) => e.is_free), now, t.midnight, t.month, 1);
  // An evening event with a ticket (or an unknown price) as an optional extra.
  const sixPm = new Date(t.midnight.getTime() - 6 * 3600_000);
  const extraEvent = events
    .filter((e) => !e.is_free && worthPicking(e.title, t.month) && sessionIn(e, sixPm, t.midnight))
    .sort((a, b) => b.quality_score - a.quality_score)[0];
  const [coffee, lunch] = await Promise.all([
    searchPlaces(`cafe coffee in ${area.name}`, area, { boxScale: 1, minReviews: 150, maxPrice: 10 }),
    searchPlaces(`cheap eats lunch in ${area.name}`, area, { boxScale: 1, minReviews: 150, maxPrice: BUDGET }),
  ]);
  const coffeePick = coffee[0] ?? null;
  const lunchPick = lunch.find((p) => p.name !== coffeePick?.name && !/coffee|café|cafe/i.test(p.kindLabel)) ?? null;
  return composeNeighbourhood({
    dateLabel: label("NOON"),
    area,
    budget: BUDGET,
    coffee: coffeePick,
    lunch: lunchPick,
    freeSpots: spots.slice(0, freeEvents.length ? 1 : 2),
    freeEvents,
    extra: extraEvent ? { e: extraEvent, when: sessionIn(extraEvent, sixPm, t.midnight)! } : null,
    now,
  });
}

/** Test sends go to EMAIL_TEST_TO, or to one address given with ?to= (service role only, like every call here). */
async function recipients(test: boolean, to: string | null): Promise<Array<{ owner: string; email: string }>> {
  if (test) return [{ owner: "test", email: to && /^[^\s@,;<>]+@[^\s@,;<>]+\.[a-z]{2,}$/i.test(to) ? to : TEST_TO }];
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data, error } = await db.from("profiles").select("owner,email").eq("marketing_opt_in", true);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r) => typeof r.email === "string" && r.email.includes("@")) as Array<{ owner: string; email: string }>;
}

/** Only pictures Geesling's own snapshot script uploaded (public email-art bucket) go into emails. */
function ownPicture(url: unknown): string | null {
  return typeof url === "string" && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/email-art/`) && /^[\w:/.%-]+\.png$/.test(url) ? url : null;
}

/** Sends to each recipient: the card as a picture when one was made, otherwise the all-text card. */
async function send(content: EmailContent, list: Array<{ owner: string; email: string }>, idempotencyBase: string, picture: string | null) {
  let sent = 0;
  const failures: string[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const batch = await Promise.all(
      list.slice(i, i + 100).map(async (r) => {
        const unsub = await unsubscribeUrl(r.owner);
        const { html, text } = picture ? renderPictureEmail(content, picture, unsub) : renderEmail(content, unsub);
        return {
          from: FROM,
          to: [r.email],
          reply_to: CONTACT_EMAIL,
          subject: content.subject,
          html,
          text,
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        };
      }),
    );
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json", "Idempotency-Key": `${idempotencyBase}-${i / 100}` },
      body: JSON.stringify(batch),
    });
    if (response.ok) sent += batch.length;
    else failures.push(`${response.status} ${(await response.text()).slice(0, 200)}`);
  }
  return { sent, failures };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isServiceRole(request)) return json({ error: "forbidden" }, 403);
  if (!RESEND_KEY || !UNSUB_SECRET || !PLACES_KEY) return json({ error: "RESEND_SEND_KEY, EMAIL_UNSUB_SECRET and GOOGLE_MAPS_SERVER_KEY must be set" }, 500);

  const params = new URL(request.url).searchParams;
  const now = new Date();
  const t = toronto(now);
  const asked = params.get("kind");
  const kind: EmailKind | null = asked === "morning" || asked === "neighbourhood" || asked === "evening" ? asked : dueEmail(t.hour);
  if (!kind) return json({ skipped: "no email due now", toronto: { hour: t.hour, day: t.day } });

  try {
    // The snapshot script sends back the content it photographed with the picture, so the picture, its description
    // and the links always match. Otherwise the content is built now.
    const body = (await request.json().catch(() => ({}))) as { content?: EmailContent; picture?: string };
    const picture = ownPicture(body.picture);
    const content = picture && body.content?.sections ? body.content : await buildContent(kind, now);
    if (content.sections.every((s) => s.items.length === 0)) return json({ skipped: "nothing worth sending today", kind });
    const test = params.get("test") === "1";
    // ?page=1: the page to photograph (renderSnapshotPage) and the content behind it; nothing is sent.
    if (params.get("page") === "1") return json({ kind, day: t.day, content, page: renderSnapshotPage(content) });
    if (params.get("dry") === "1") {
      const { html, text } = picture ? renderPictureEmail(content, picture, await unsubscribeUrl("test")) : renderEmail(content, await unsubscribeUrl("test"));
      return json({ dry: true, kind, subject: content.subject, preheader: content.preheader, text, html });
    }
    const list = await recipients(test, params.get("to"));
    const result = await send(content, list, test ? `test-${kind}-${Date.now()}` : `${kind}-${t.day}`, picture);
    console.log("daily email", { kind, day: t.day, test, picture: Boolean(picture), recipients: list.length, ...result });
    return json({ kind, day: t.day, test, picture: Boolean(picture), subject: content.subject, recipients: list.length, ...result });
  } catch (e) {
    console.error("daily email failed", kind, (e as Error).message);
    return json({ error: (e as Error).message, kind }, 500);
  }
});
