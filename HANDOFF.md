# Geesling — session handoff prompt

Paste everything below the line into a new Claude (or other AI) session to continue.

---

You are an expert full-stack engineer and product designer continuing work on **Geesling**, an app where a Toronto goose named Geesling walks the user around the city based on a plain-language prompt (e.g. "5 unique, low-cost activities: new food, a sweet treat, maybe thrifting"). Write clean, complete, working code. No placeholders like `// add logic here`.

## Project location
- Local folder: `~/Claude.md/geesling` (its own git repo; the parent `~/Claude.md` is an unrelated repo, don't touch it).
- GitHub: https://github.com/bhargavamodukuru-glitch/geesling (it started empty). Push updates there. The `gh` CLI is not installed; use plain `git`.
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

## Checklist
- [x] Expo app scaffolded, deps installed
- [x] Supabase migration (`supabase/migrations/20261018000000_init.sql`) + `supabase/config.toml` (anonymous sign-ins on)
- [x] Ingestion: `ingest/lib/*`, `ingest/sources/{toronto,ticketmaster,eventbrite}.ts`, `ingest/run.ts`, `.github/workflows/ingest.yml`. Dry run against the live Toronto feed works: 27,111 rows → ~310 upcoming events
- [x] Guide edge function `supabase/functions/geesling/{index,prompt,places,routes}.ts` (passes `deno check`)
- [x] App UI: `src/app/{_layout,index,walk/[id]}.tsx`, components (map native + web, MapPin, Goose sprite, Pixel UI, ItemSheet, WalkCard, Happening/Saved/Geesling panels), hooks, lib
- [x] README, `.env.example`
- [x] Typecheck + lint clean, expo-doctor 20/20, web export builds, web UI checked in browser at phone and laptop widths
- [ ] Push to GitHub: this machine had no GitHub credentials. The user must authenticate (`gh auth login` or a personal access token), then run `git push -u origin main`
- [ ] User provides keys (Supabase project, Anthropic, Google Maps/Places/Routes, Ticketmaster, Eventbrite) and deploys per the README
- [ ] Not yet verified live: Ticketmaster/Eventbrite adapters, the guide function end to end, native map pins on a device (all need keys)

Ideas for next steps: add a pixel-art app icon and splash; geocode the ~100 City of Toronto events that have no GPS; add EAS build profiles; add admin tooling to manage Eventbrite organizers.

When resuming: run `git -C ~/Claude.md/geesling status` and `git log` to see what's committed, then continue from the first unchecked item.
