# Geesling — session handoff prompt

> **Read the "Current state (2026-10-20)" block first.** Everything under the line after it was written on 2026-10-18 and is partly out of date (model, scope, Toronto-only wording). Where they disagree, trust the current-state block and the code.

## Current state (2026-10-20)

**Branches**
- `main` is the shipped line. It has 40+ commits (welcome scene, event filters, photo-spot pins, social links, Haiku 5.5 guide, usage report) plus the guided planner below.
- `wip/hidden-eggs-gta` holds parked, unfinished work and is **local only (never pushed)**: Hidden Eggs (community picks), GTA-wide ingest (`isInGTA`, Ticketmaster 60 km), guide `timeZone` and regional search, `eas.json`, `expo run:*` scripts, `MOBILE_TESTING_HANDOFF.md`, README edits. Its two migrations (`20261020000000_hidden_gems.sql`, `...0001_hidden_egg_submissions.sql`) are **not applied** to the live database and `supabase/functions/hidden-egg-places` is **not deployed**. Do not deploy from that branch without applying the migrations first.

**Guided planner (the 2026-10-20 change, on `main`)**
- Home (`src/components/GeeslingWelcome.tsx`): the heading "What’s the vibe today?" over five vibe chips (Date, Friends, Solo, Try something new, Surprise me; there is no separate "Make a plan" button), "or just tell me what you're after" (the old free-text box), and a red **Skip to live map** button. Inside the planner and the free-text box, skip is a quiet link so it never competes with "Plan it" / "Find my walk". The Chill and Artsy & cultural vibes are only reachable through **Adjust**, since they are not among the five chips.
- `src/components/PlannerFlow.tsx`: 3 steps (vibe, time + budget, start + travel) with defaults pre-selected and "Skip the rest and use the highlighted choices". A shortcut skips step 1. Location permission is requested only when "Near me" is tapped; otherwise the person picks a starting area.
- `src/lib/planner.ts`: pure, import-free logic. `buildPlanRequest(prefs, userLocation)` turns the choices into `{ prompt, display, timeBudgetMinutes, freeOnly, origin }`. Budget wording is per vibe (`BUDGET_WORDING` in `planner.ts`: "for the two of you", "total for the group", "your budget", etc.); the planner heading, its note and the sentence sent to the guide all come from that one table. `display` is the short label shown in the chat bubble; `prompt` is what the guide receives.
- Wiring: `src/app/index.tsx` (`startPrompt(request)`) → `GeeslingPanel` (`initialRequest`; undefined fields fall back to the panel's own state, so free text behaves as before). No backend change, no new routes.
- **Results step (2026-10-20, committed and deployed):**
  - `src/lib/planSummary.ts` (pure) + the summary block in `WalkCard` (so chat, Saved and shared walks all get it): total time split into travel / time at stops / waiting for an event to start; a cost line; and "Book ahead" for stops that need a ticket or RSVP.
  - The cost line states only what is listed: confirmed-free stops, listed event ticket prices (a range, "each", never multiplied by party size), and a count of stops with no listed price. Google returns price levels ($, $$), not amounts, so places are never given a dollar figure.
  - **Try another** (`buildRetryRequest` in `planner.ts`, wired in `GeeslingPanel`): same choices plus a list of names already shown, sent in the prompt; no server change. Capped at `MAX_RETRIES = 3` per request, then the panel suggests Adjust. Appears only under the newest plan.
  - **Adjust**: reopens `PlannerFlow` (`initialPrefs`) with the last choices filled in; "Near me" is only reused if location is still available. For free-text requests it opens the planner with defaults.
- Tests: `npm test` runs `tests/planner.test.ts`, `tests/routes.test.ts` and `tests/planSummary.test.ts` (42 tests across `planner`, `routes`, `planSummary`, `placeBadges` and `area`; `node:test`, no new dependency).

**Checks (all pass on `main`)**: `npm run typecheck` (app, ingest, tests), `npx expo lint`, `npm test`. `npx expo-doctor` has 1 advisory failure: 4 patch versions behind (expo, expo-font, expo-location, expo-router); not upgraded.

**Verified**: the flow in a browser at phone width; one real request (Date · 1–2 hours · Under $25 · Yorkville · Walking) reached the live guide with the right budget, start coordinates and prompt. **Not verified**: "Near me" permission grant and denial, any iOS or Android device, `eas build`.

- **Toronto-only map (2026-10-20, committed and deployed).** Decision by the user: Geesling is a Toronto app; the nearby-places layer and the "NEW" label were dropped.
- **City border and out-of-area message (2026-10-20, committed and deployed; guide prompt rule verified live with a Niagara Falls request).** `src/lib/area.ts` now holds the real city limit (474 points, simplified from the City of Toronto's Regional Municipal Boundary open data, OGL-Toronto) and `isInToronto` is a point-in-polygon test (Pearson Airport and Mississauga/Markham are correctly outside). Both maps draw the limit as a dashed line and dim everything outside it; people can pan about 0.2° (lat) / 0.3° (lng) past the limit but no further (`PAN_BOUNDS`, replaces the old hard clamp). When the middle of the view is outside the city, the map screen shows "Honk! Development in progress for this area." The chat answers the same for requests that name another city (`mentionsOtherPlace`, a fixed list, checked client-side only when the message doesn't say Toronto); other out-of-area requests rely on a new rule 9 in `supabase/functions/geesling/prompt.ts`, which needs `supabase functions deploy geesling --use-api` to take effect. Known limit: the list reads "London Fields" as London.
  - `src/lib/area.ts`: `TORONTO_BOUNDS` (43.55–43.90 N, -79.67 – -79.09 W; a box, so it takes in slivers of neighbouring cities), `isInToronto`, `clampToToronto`.
  - Web (`CityMap.web.tsx`): Google Maps `restriction` with `strictBounds` and `minZoom` 10. Native (`CityMap.tsx`): after a gesture, the camera is pulled back into the box and kept from zooming out past the city (works on Apple and Google maps); a ref guard stops it re-correcting itself.
  - Location is only used when it is inside Toronto (`index.tsx`): "Skip to live map" asks for it while the loader shows (waits up to ~6 s) and the map opens on the person's spot; a location elsewhere is ignored for the map, the planner's "Near me" and the guide's `origin`, with a note ("You're outside Toronto, so this map shows downtown Toronto"). Denied or failed location shows a dismissible note with Try again.
  - Verified on web with simulated locations (Ottawa → downtown Toronto + note; Scarborough → centered there), zoom floor, and a hard drag east that stopped at the city edge. Not verified: real GPS, any phone.
  - **Top-rated star:** `isTopRated` (`src/lib/placeBadges.ts`): Google rating strictly above 4.5 with at least 20 reviews. Gold ★ on the pin (`MapPin`), "★ 4.9" in the walk card's stop line, "★ Top rated" in the detail sheet. Place pins only exist inside walks and the curated photo spots, so the star only shows there.
  - **Budget wording is per vibe** (see `BUDGET_WORDING`).
  - Ingest still keeps events from the wider Toronto-area box (`ingest/lib/classify.ts` `isInToronto`, which includes Mississauga, Markham etc.); the map can't show them. Narrowing the ingest box to `TORONTO_BOUNDS` would stop storing events nobody can see.

**Google Places: what was researched and decided (2026-10-20)** — so nobody repeats it.
  - Pricing (per 1,000 calls; first 1,000/month free for the Enterprise tiers): Nearby/Text Search Pro $32 (5,000 free), Enterprise $35 (adds rating and review count), Enterprise + Atmosphere $40 (adds reviews and `editorialSummary`). Nearby Search returns at most 20 places, no paging. Our guide's Text Search calls already sit at the $40 tier because the field mask includes `editorialSummary`. Sources: developers.google.com/maps/billing-and-pricing/pricing and .../places/web-service/data-fields.
  - A map-wide places layer would cost about $0.04 per map load (~$80/month for 20 testers at 5 loads a day). Dropped by the user.
  - Google has no opening date for recently opened places (`openingDate` is only set for FUTURE_OPENING), so a "NEW" label would be a heuristic (few reviews, all recent). Dropped.
  - **Unresolved compliance risks in what is live** (found while researching; not fixed): (1) iOS uses Apple Maps, and Google's terms bar showing Places content on a non-Google map, so walk pins with Google names and ratings on iPhone break that rule (fix: use Google Maps on iOS; `app.config.ts` already supports an iOS key); (2) we store Google content. **2a fixed (2026-10-20):** the unused `places` table (369 rows of names, addresses, ratings, hours and summaries, written by the guide, publicly readable through the API) is no longer written (`cachePlaces` removed from the guide) and its rows were deleted by migration `20261020120000_stop_places_cache.sql`; the table stays, empty. **2b still open:** every saved or shared walk keeps a snapshot of each stop's Google fields in `walks.stops`, and Google's policy says not to store Places content beyond place IDs (I could not read the exact exceptions). Fixing it means storing place IDs plus our own text and fetching names and ratings when a walk is opened, which costs Google calls per stop per view; price that before deciding. Note: `wip/hidden-eggs-gta` (Hidden Eggs) relied on that places cache, so it needs a different design if revived; and its migrations (`20261020000000`, `...0001`) sort before `20261020120000`, so applying them later needs `supabase db push --include-all`; (3) Places data shown without a Google map (walk cards, detail sheet) needs the Google logo, not just text. See developers.google.com/maps/documentation/places/web-service/policies.

**Known gaps (found while testing; not fixed)**
1. **Walking is now enforced (fixed 2026-10-20).** The planner sends `travel`; the guide skips TRANSIT routing when it is `walk` (`routes.ts` `bestLeg(..., allowTransit)`), and the existing 20-minute hop limit sends long walking hops back to the model. Proven by `tests/routes.test.ts` (mocked Google Routes). Live check: a Walking request returned only walking legs, but it did not hit a hop that would have used TTC before, so enforcement itself rests on the unit tests.
1b. **Intermittent no-walk reply.** 1 of 3 live requests (same Walking choices) returned the fallback "Tell me a bit more" with no walk; the next two succeeded. Cause not determined (the loop ended without `present_walk`). The server logs nothing about why. **Update 2026-10-20:** the user hit it again (Friends · 3–4 hours · Harbourfront). Likely cause: commit 78deee8 cut `MAX_TURNS` from 8 to 5 to save cost. Commit e8ef8d8 (deployed) restores 8, tells the guide to present what it has when 2 turns are left, and logs `no walk presented` with the message count. After deploying, the same request returned a walk 5 of 5 times, but each took 26–31 s and two had only 2 stops. If it recurs, check the function logs for that line, and consider falling back to the last candidate walk trimmed at the first long hop.
2. **Time is prompt-only; budget is now enforced (2026-10-20).** Budget: the planner's Under $25/$50 is sent as `budgetLimit` + `partySize` (Date = 2 people, every other vibe per person; the user chose to make Friends "BUDGET PER PERSON" rather than ask a headcount). The user chose "only known prices": `supabase/functions/geesling/budget.ts` counts an event at its cheapest listed ticket and a place at the top of Google's `priceRange` (now in the field mask, same $40 SKU), anything else is unknown. Searches drop items that can't fit on their own and `present_walk` is rejected if any stop is unpriced or the total for everyone is over the limit. Free-text budgets ("under $30" typed in chat) are still prompt-only. `priceRange` is Google content stored in walk snapshots, so it falls under compliance item 2b. Still open: the test walk planned 122 minutes against a 120-minute window, and nothing checks opening hours at arrival or time fit in code. Plan: deterministic hard filters + a transparent score, returning up to 3 plans.
3. **Driving is not offered** because routing supports walking and TTC only.
4. Plans arrive one at a time (Try another, max 3), not as 3 side-by-side cards; each retry is a full guide request. The avoid-list is prompt-only (it worked in one live test: a completely different plan). The goose can still claim "under $25" while the summary shows stops with no listed price; budget is not verified in code. Not exercised live: the 3-retry cap message, Adjust on a desktop-width layout, any device.
5. Data: about 1,450 live events (Ticketmaster ~1,060, City of Toronto ~380, Eventbrite 0: `EVENTBRITE_TOKEN` not set as a GitHub secret). Every Ticketmaster event is flagged "RSVP/tickets required" and ~76% have no price. There is no client analytics beyond `guide_usage` and `walks`.

**Production (2026-10-20)**: `https://geesling.expo.app` serves everything on `main` as of commit `52c7cff` (guided planner, Walking enforcement, results step, welcome-screen changes, per-vibe budget wording, Toronto-only map, top-rated star); verified byte for byte and in a browser. The deployed `geesling` function source is identical to `main` (checked by downloading it; its version number is higher than the last deploy made from here because it has been redeployed since, with the same code). **Deploy gotcha:** after `npm run deploy:web` the production address can keep serving the previous build for a minute or more even though the CLI says "Promoted"; check that the entry file named in `https://geesling.expo.app/` matches `dist/index.html`, and rerun `npx eas-cli@latest deploy --prod` (uses the existing `dist`) if it doesn't. Supabase function `geesling` is v45 (includes `travel`); `usage-report` is v32. Deploy web with `npm run deploy:web` (builds from the working tree, so keep it clean first) and the guide with `supabase functions deploy geesling --use-api`.

**Env var names only** — app: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY`, `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID`, `EXPO_PUBLIC_SITE_URL`, `GOOGLE_MAPS_ANDROID_API_KEY`, `GOOGLE_MAPS_IOS_API_KEY`. Ingest/CI: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TICKETMASTER_API_KEY`, `EVENTBRITE_TOKEN`. Edge-function secrets: `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_SERVER_KEY`, `USAGE_REPORT_TOKEN`. `.env` and `supabase/functions/.env` are git-ignored.

**Recommended next task**: make no-walk replies diagnosable (gap 1b), then the deterministic filter/score core (gap 2) so hours and time fit are checked in code (budget is done).

---

Paste everything below the line into a new Claude (or other AI) session to continue.

---

You are an expert full-stack engineer and product designer continuing work on **Geesling**, an app where a Toronto goose named Geesling walks the user around the city based on a plain-language prompt (e.g. "5 unique, low-cost activities: new food, a sweet treat, maybe thrifting"). Write clean, complete, working code. No placeholders like `// add logic here`.

## Project location
- Local folder: `~/Claude.md/geesling` (its own git repo; the parent `~/Claude.md` is an unrelated repo, don't touch it).
- GitHub: https://github.com/bhargavamodukuru-glitch/geesling (it started empty). Push updates there. The `gh` CLI is installed at `/opt/homebrew/bin/gh` (Homebrew is not on PATH by default).
- Visual reference: the Lovable preview (https://lovable.dev/preview/D8MjkSf6WGlo26c2SiFBxbaexNVwG7n9) uses a cream parchment background, a pixel font, red title text, hard black drop shadows, tabs (Happening / Saved / Bestie), vibe chips ("Step outside your comfort zone", "Low-key chill", "Meet people", "Artsy & weird") and a pixel goose with a speech bubble.

## Product decisions (confirmed by the user)
- Audience: 18–30 and tourists. Runs on iOS, Android and laptops (web).
- **Both events and places**:
  - Events have start/end times and come from listing sources.
  - Places are always available and come from the Google Places API.
  - Geesling mixes both into one walk.
- Pins: **free = green, paid = purple**. Drinking-related events/places get a **🍻 next to the pin**.
- The app itself is free. Always show when an event **needs an RSVP or tickets ahead of time**.
- **One event record with a schedule**, not one record per occurrence.
- Only current and future events. Events happening now show as LIVE. Future events with a confirmed date show **the date on the pin**.
- Walks: include **TTC transit** for longer legs, let the user set a **time budget** (e.g. "I have 4 hours"), and make walks **saveable and shareable**.
- Accounts: **anonymous** to start (Supabase anonymous sign-in).
- Sources:
  - City of Toronto open-data feed.
  - **Ticketmaster Discovery API** for concerts and clubs.
  - Eventbrite via its official API.
- Duplicates across sources: keep the single most accurate record (from one source); don't merge fields.
- Source caveats found during the build:
  - BlogTO's robots.txt explicitly prohibits automated scraping, so BlogTO is excluded until ZoomerMedia gives written permission.
  - Eventbrite's public search API is retired and its terms prohibit scraping, so Eventbrite events come from organizers we follow (`eventbrite_organizers` table) through the official API.

## Tech stack
- **Expo SDK 58** (React Native 0.88, React 19.3) + **Expo Router** (routes in `src/app/`), TypeScript.
  - Read `AGENTS.md` in the repo. Always `npx expo install <pkg>`, and check versioned docs at docs.expo.dev/versions/v58.0.0.
- Maps:
  - Phones: **react-native-maps** (Apple Maps on iOS, Google Maps on Android, works in Expo Go).
  - Web: **@vis.gl/react-google-maps** (platform file `*.web.tsx`).
- Backend: **Supabase** (Postgres, RLS, anonymous auth, Edge Functions).
  - Schema: `supabase/migrations/20261018000000_init.sql`. Tables: `events`, `places`, `walks`, `saved_items`, `guide_usage`, `ingestion_runs`, `eventbrite_organizers`. RPCs: `events_in_bounds`, `search_events`, `event_next_session`, `purge_stale`. Tested in PGlite.
  - The schema uses plain lat/lng (no PostGIS), and each event's `schedule` is a jsonb array of `{start, end}` sessions.
- Ingestion: a **Node 24 TypeScript script** (`ingest/`, native type-stripping, `.ts` imports, no build step), run by a **GitHub Actions cron**.
  - It runs in Actions because the City of Toronto feed is a 228 MB JSON file, too big for an Edge Function.
  - It writes to Supabase through PostgREST using the service-role key.
- AI guide: Supabase Edge Function `supabase/functions/geesling` (Deno), using `npm:@anthropic-ai/sdk@0.135.0`.
  - Model `claude-opus-5-5`, adaptive thinking, `output_config.effort: "medium"`, and server-side `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`.
  - Manual tool loop with these tools:
    - `search_events`: SQL RPC.
    - `search_places`: Google Places API (New) Text Search.
    - `present_walk`: a strict-schema tool for the final itinerary.
  - Forced `tool_choice` is NOT allowed on Opus 5.5; use `auto` and steer from the prompt.
  - After `present_walk`, the server validates the stop IDs, computes the route with the Google Routes API (WALK, or TRANSIT for legs over ~1.8 km), saves the walk to `walks`, and returns it.
  - Rate limit: 20 requests per user per hour, tracked in `guide_usage`.
- Style: Stardew Valley pixel look.
  - Fonts: Pixelify Sans (headings) and VT323 (body).
  - Colors: parchment `#F6E7C1`, wood `#8B5A2B` / `#5B3A1E`, ink `#3B2412`, free green `#5DAA3C`, paid purple `#8E5CC4`, accent red `#C8412F`, gold `#F2C14E`.
  - The goose sprite is drawn as a pixel grid of Views (no image assets), with a two-frame walk animation.
- Categories: music, nightlife, arts_culture, gallery, film, food_drink, market, festival, comedy, theatre, sports, workshop, community, outdoors, family. "Free" and "weekend" are filters, not categories.

## Status: see the checklist at the bottom of this file (kept up to date)

## Live app
- Web: https://geesling.expo.app (EAS Hosting, Expo project @bhargavmod/geesling). Redeploy with `npm run deploy:web`.
- Supabase project ref: agmizhktrsaehtsrtzsp. Guide function `geesling` deployed; secrets ANTHROPIC_API_KEY + GOOGLE_MAPS_SERVER_KEY set (separate server key). The web Maps key is restricted to localhost:8081 + geesling.expo.app and to the Maps JavaScript API only.
- Anthropic account had no credit as of 2026-10-18, so the goose chat returns an error until credit is added.

## Checklist
- [x] Expo app scaffolded, deps installed
- [x] Supabase migration (`supabase/migrations/20261018000000_init.sql`) + `supabase/config.toml` (anonymous sign-ins on)
- [x] Ingestion: `ingest/lib/*`, `ingest/sources/{toronto,ticketmaster,eventbrite}.ts`, `ingest/run.ts`, `.github/workflows/ingest.yml`. Dry run against the live Toronto feed works: 27,111 rows → ~310 upcoming events
- [x] Guide edge function `supabase/functions/geesling/{index,prompt,places,routes}.ts` (passes `deno check`)
- [x] App UI: `src/app/{_layout,index,walk/[id]}.tsx`, components (map native + web, MapPin, Goose sprite, Pixel UI, ItemSheet, WalkCard, Happening/Saved/Geesling panels), hooks, lib
- [x] README, `.env.example`
- [x] Typecheck + lint clean, expo-doctor 20/20, web export builds, web UI checked in browser at phone and laptop widths
- [x] Pushed to GitHub (main). The `gh` CLI is at /opt/homebrew/bin/gh and is logged in as bhargavamodukuru-glitch
- [ ] User provides keys (Supabase project, Anthropic, Google Maps/Places/Routes, Ticketmaster, Eventbrite) and deploys per the README
- [ ] Not yet verified live: Ticketmaster/Eventbrite adapters, the guide function end to end, native map pins on a device (all need keys)

Ideas for next steps: add a pixel-art app icon and splash; geocode the ~100 City of Toronto events that have no GPS; add EAS build profiles; add admin tooling to manage Eventbrite organizers.

When resuming: run `git -C ~/Claude.md/geesling status` and `git log` to see what's committed, then continue from the first unchecked item.
