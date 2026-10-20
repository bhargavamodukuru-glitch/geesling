# 🪿 Geesling

Geesling is a Toronto goose who walks you around the city. Tell it your vibe ("5 unique, low-cost things: new food, a sweet treat, maybe thrifting"), and it builds a walk out of **events happening now or soon** and **places that are always open**, with walking and TTC directions between stops. The look is inspired by Stardew Valley.

Built for iOS, Android, and laptops (web) from one Expo codebase.

## What you see

- **Map pins**: 🟩 green = free, 🟪 purple = paid. 🍻 next to a pin = drinks involved (bars, breweries, 19+, cocktails).
- **Pin labels**: `LIVE` while an event is on, a time if it starts today, otherwise its confirmed date (e.g. `Oct 24`). Past events never appear.
- **RSVP warnings**: any event that needs a ticket or registration ahead of time is marked 🎟️ and links straight to RSVP/tickets.
- **Tabs**:
  - **Happening**: what's on in the map area, filtered by Live now / Today / Weekend / This week / 30 days, Free only, and category (concerts, club nights, arts and culture, gallery openings, film screenings, food, markets, festivals, comedy, outdoors).
  - **Saved**: starred events, places, and walks.
  - **Geesling**: chat with the goose. Has vibe shortcuts, a time budget (1 hr to all day), and returns walks you can show on the map, open in Apple/Google Maps, share, or save.
- Shared walks open at `/walk/<id>` on the web or `geesling://walk/<id>` in the app.

## Architecture

```
GitHub Actions (every 3h)           Supabase                         Expo app (iOS / Android / web)
  ingest/run.ts (Node 24)  ──────▶  Postgres: events, places,  ◀──── events_in_bounds() for the map
   • City of Toronto feed            walks, saved_items (RLS)  ◀──── saved_items (anonymous auth)
   • Ticketmaster Discovery          Edge Function "geesling"  ◀──── chat → walk
   • Eventbrite (organizers)           Claude Opus 5.5 tool loop:
   • de-duplicate across sources       search_events (SQL)
                                       search_places (Google Places)
                                       present_walk → Google Routes (walk / TTC)
```

| Layer | Choice |
|---|---|
| App | Expo SDK 58, React Native 0.88, Expo Router, TypeScript |
| Maps | `react-native-maps`: Apple Maps on iOS, Google Maps on Android. `@vis.gl/react-google-maps` on web |
| Backend | Supabase: Postgres with RLS, anonymous sign-in, Edge Functions (Deno) |
| AI guide | Claude (`claude-opus-5-5`) with tools; server-side refusal fallback enabled |
| Places & routing | Google Places API (New) Text Search, Google Routes API (WALK + TRANSIT) |
| Ingestion | Node 24 TypeScript (no build step), scheduled with GitHub Actions |

### Data model

- **`events`**: one row per real-world event, with its whole **schedule** (`[{start, end}]`). A 10-day festival or a weekly market is one event, not ten.
  - Pricing: `is_free`, `price_min`/`price_max`, `price_note`.
  - Booking: `rsvp_required`, `rsvp_note`, `ticket_url`.
  - Drinks and age: `involves_alcohol` (🍻), `age_min`.
  - Each event belongs to one of 15 categories: music, nightlife, arts_culture, gallery, film, food_drink, market, festival, comedy, theatre, sports, workshop, community, outdoors, family.
  - `quality_score` is used to choose between duplicates.
- **`places`**: a cache of Google Places results shown in walks. Data is purged after 30 days, per Google's terms.
- **`walks`**: Geesling's itineraries: stops, why each one was picked, arrival and leave times, and each leg (walk or TTC line, duration, polyline). They are public by id so they can be shared.
- **`saved_items`**: each anonymous user's starred events, places, and walks.
- **Duplicates**: when the same event appears on several sources, the ingest keeps the **single most accurate listing**. The score is source trust (City of Toronto > Ticketmaster > Eventbrite) plus completeness (description, image, venue, price, real end time).

### Event sources

| Source | How | Notes |
|---|---|---|
| City of Toronto Festivals & Events | Open data JSON feed | Free, official; includes free/RSVP flags, prices, recurring schedules |
| Ticketmaster | Discovery API v2 | Concerts, club nights, sports, theatre within 35 km |
| Eventbrite | API v3, events of organizers you list | Eventbrite retired public city-wide search, and its terms prohibit scraping. Add organizers to `eventbrite_organizers` |
| BlogTO | **Not included** | BlogTO's robots.txt and terms prohibit automated collection. Request written permission from ZoomerMedia before adding it |

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from this folder run:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
3. Turn on anonymous sign-ins: Dashboard → Authentication → Sign In / Providers → **Allow anonymous sign-ins**. (`supabase/config.toml` already does this for local dev.)
4. Set the guide function's secrets and deploy it:
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=... GOOGLE_MAPS_SERVER_KEY=...
   supabase functions deploy geesling
   ```

### 2. Google Cloud keys

Enable the following APIs, and create a separate, restricted key for each use:

| Key | APIs | Used by |
|---|---|---|
| `GOOGLE_MAPS_SERVER_KEY` | Places API (New), Routes API | Edge Function (secret) |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Maps JavaScript API | Web map (restrict to your domains) |
| `GOOGLE_MAPS_ANDROID_API_KEY` | Maps SDK for Android | Android builds |

Optional: for the Stardew map look on the web, create a Cloud **Map ID**, paste the style from `src/components/map/mapStyle.ts` into it, and set `EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID`. Android uses that style automatically, and iOS uses Apple Maps' muted style.

### 3. Event ingestion

1. Get a free Ticketmaster key at [developer.ticketmaster.com](https://developer.ticketmaster.com).
2. Optional: create an Eventbrite private token, then add the Toronto organizers you want to follow:
   ```sql
   insert into eventbrite_organizers (id, name) values ('1234567890', 'Some Toronto Collective');
   ```
3. In GitHub → Settings → Secrets → Actions, add `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TICKETMASTER_API_KEY`, and `EVENTBRITE_TOKEN`.
4. The **Ingest Toronto events** workflow runs every 3 hours and after ingestion changes on `main`. It imports confirmed events up to 365 days ahead. Set `INGEST_HORIZON_DAYS` to override that window.

Run it locally:

```bash
npm run ingest:dry
```

That command fetches and normalizes the events and writes `ingest-preview.json`, without touching the database. Use `npm run ingest` to actually write to Supabase.

### 4. Run the app

```bash
npm install
cp .env.example .env
npx expo start
```

Fill in `.env` first. Then press `w` for web, or scan the QR code with Expo Go (iOS/Android). For store builds, use EAS:

```bash
npx eas-cli@latest build --platform all
```

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Expo dev server |
| `npm run typecheck` | Type-checks the app, the ingest code and the tests |
| `npm test` | Unit tests for the guided-planner logic |
| `npx expo lint` | Lint |
| `npm run ingest:dry` | Ingest preview (no writes) |
| `npm run ingest` | Ingest into Supabase |
| `npm run export:web` | Static web build in `dist/` |
| `npm run deploy:web` | Build and publish to https://geesling.expo.app |
