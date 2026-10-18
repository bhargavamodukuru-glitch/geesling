-- Geesling core schema
-- Events (time-bound, from listing sources) and Places (always available, from Google Places)
-- share one map. Each event is ONE record with a schedule (jsonb array of sessions).

-- gen_random_uuid() is built into Postgres 13+.

-- array_to_string is STABLE in general; for text[] it is safe to treat as immutable,
-- which generated columns require.
create or replace function public.text_array_join(arr text[])
returns text
language sql
immutable
parallel safe
as $$ select array_to_string(arr, ' ') $$;

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
create table public.events (
  id               uuid primary key default gen_random_uuid(),
  source           text not null check (source in ('toronto', 'ticketmaster', 'eventbrite')),
  source_id        text not null,
  title            text not null,
  description      text,
  categories       text[] not null default '{}',
  tags             text[] not null default '{}',
  url              text,
  image_url        text,
  venue_name       text,
  address          text,
  lat              double precision not null,
  lng              double precision not null,
  is_free          boolean not null default false,
  price_min        numeric(10, 2),
  price_max        numeric(10, 2),
  currency         text not null default 'CAD',
  price_note       text,
  rsvp_required    boolean not null default false,
  rsvp_note        text,
  ticket_url       text,
  involves_alcohol boolean not null default false,
  age_min          smallint,
  accessible       boolean,
  -- [{ "start": ISO-8601, "end": ISO-8601 }], sorted by start, future-ish sessions only
  schedule         jsonb not null default '[]'::jsonb,
  schedule_summary text,
  first_start_at   timestamptz not null,
  last_end_at      timestamptz not null,
  quality_score    smallint not null default 0,
  run_id           uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  search           tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(venue_name, '')), 'B') ||
    setweight(to_tsvector('english', public.text_array_join(categories || tags)), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) stored,
  unique (source, source_id),
  check (jsonb_typeof(schedule) = 'array')
);

create index events_last_end_idx on public.events (last_end_at);
create index events_lat_lng_idx on public.events (lat, lng);
create index events_categories_idx on public.events using gin (categories);
create index events_search_idx on public.events using gin (search);

-- ---------------------------------------------------------------------------
-- Places (Google Places cache; Google ToS allows caching place_id indefinitely,
-- other fields are refreshed and purged after 30 days)
-- ---------------------------------------------------------------------------
create table public.places (
  id               text primary key,          -- Google place id
  name             text not null,
  primary_type     text,
  types            text[] not null default '{}',
  address          text,
  lat              double precision not null,
  lng              double precision not null,
  price_level      text,
  is_free          boolean not null default false,
  involves_alcohol boolean not null default false,
  rating           numeric(2, 1),
  rating_count     integer,
  website          text,
  maps_url         text,
  summary          text,
  opening_hours    jsonb,
  fetched_at       timestamptz not null default now()
);

create index places_fetched_idx on public.places (fetched_at);

-- ---------------------------------------------------------------------------
-- Walks (Geesling itineraries) — shareable by id
-- ---------------------------------------------------------------------------
create table public.walks (
  id                  text primary key,
  owner               uuid,
  prompt              text not null,
  title               text not null,
  intro               text not null,
  outro               text,
  time_budget_minutes integer,
  start_lat           double precision,
  start_lng           double precision,
  stops               jsonb not null,
  total_minutes       integer,
  created_at          timestamptz not null default now()
);

create index walks_owner_idx on public.walks (owner, created_at desc);

-- ---------------------------------------------------------------------------
-- Saved items (per anonymous user)
-- ---------------------------------------------------------------------------
create table public.saved_items (
  owner      uuid not null default auth.uid(),
  kind       text not null check (kind in ('event', 'place', 'walk')),
  item_id    text not null,
  snapshot   jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner, kind, item_id)
);

-- ---------------------------------------------------------------------------
-- Guide usage (rate limiting) and ingestion audit
-- ---------------------------------------------------------------------------
create table public.guide_usage (
  id         bigint generated always as identity primary key,
  owner      uuid not null,
  created_at timestamptz not null default now()
);

create index guide_usage_owner_idx on public.guide_usage (owner, created_at desc);

create table public.ingestion_runs (
  id          uuid primary key,
  started_at  timestamptz not null,
  finished_at timestamptz,
  stats       jsonb not null default '{}'::jsonb
);

-- Eventbrite's public search API is gone; we pull live events from organizers we follow.
create table public.eventbrite_organizers (
  id      text primary key,
  name    text not null,
  enabled boolean not null default true
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.events enable row level security;
alter table public.places enable row level security;
alter table public.walks enable row level security;
alter table public.saved_items enable row level security;
alter table public.guide_usage enable row level security;
alter table public.ingestion_runs enable row level security;
alter table public.eventbrite_organizers enable row level security;

create policy "events are public" on public.events for select to anon, authenticated using (true);
create policy "places are public" on public.places for select to anon, authenticated using (true);
create policy "walks are public" on public.walks for select to anon, authenticated using (true);

create policy "read own saved" on public.saved_items for select to authenticated using (owner = auth.uid());
create policy "insert own saved" on public.saved_items for insert to authenticated with check (owner = auth.uid());
create policy "update own saved" on public.saved_items for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy "delete own saved" on public.saved_items for delete to authenticated using (owner = auth.uid());
-- guide_usage, ingestion_runs, eventbrite_organizers: service role only (no policies).

-- ---------------------------------------------------------------------------
-- Query helpers
-- ---------------------------------------------------------------------------

-- The next session of an event that has not ended yet (live or upcoming).
create or replace function public.event_next_session(sched jsonb, after_ts timestamptz default now())
returns table (session_start timestamptz, session_end timestamptz)
language sql
stable
as $$
  select (s->>'start')::timestamptz, (s->>'end')::timestamptz
  from jsonb_array_elements(sched) as s
  where (s->>'end')::timestamptz > after_ts
  order by (s->>'start')::timestamptz
  limit 1
$$;

-- Map query: events with a session overlapping [from_ts, to_ts] inside a bounding box.
create or replace function public.events_in_bounds(
  min_lat double precision,
  min_lng double precision,
  max_lat double precision,
  max_lng double precision,
  from_ts timestamptz default now(),
  to_ts timestamptz default now() + interval '30 days',
  free_only boolean default false,
  cats text[] default null,
  lim integer default 400
)
returns table (
  id uuid, source text, title text, description text, categories text[], tags text[],
  url text, image_url text, venue_name text, address text, lat double precision, lng double precision,
  is_free boolean, price_min numeric, price_max numeric, currency text, price_note text,
  rsvp_required boolean, rsvp_note text, ticket_url text, involves_alcohol boolean, age_min smallint,
  accessible boolean, schedule_summary text, next_start timestamptz, next_end timestamptz, is_live boolean
)
language sql
stable
as $$
  select e.id, e.source, e.title, e.description, e.categories, e.tags,
         e.url, e.image_url, e.venue_name, e.address, e.lat, e.lng,
         e.is_free, e.price_min, e.price_max, e.currency, e.price_note,
         e.rsvp_required, e.rsvp_note, e.ticket_url, e.involves_alcohol, e.age_min,
         e.accessible, e.schedule_summary, n.session_start, n.session_end,
         (n.session_start <= now() and n.session_end > now())
  from public.events e
  cross join lateral public.event_next_session(e.schedule, greatest(from_ts, now())) n
  where e.last_end_at > now()
    and e.lat between min_lat and max_lat
    and e.lng between min_lng and max_lng
    and n.session_start < to_ts
    and (not free_only or e.is_free)
    and (cats is null or e.categories && cats)
  order by n.session_start
  limit least(lim, 1000)
$$;

-- Guide query: full-text + distance search over live/upcoming events.
create or replace function public.search_events(
  q text default null,
  from_ts timestamptz default now(),
  to_ts timestamptz default now() + interval '14 days',
  center_lat double precision default null,
  center_lng double precision default null,
  radius_km double precision default 15,
  free_only boolean default false,
  max_price numeric default null,
  cats text[] default null,
  lim integer default 25
)
returns table (
  id uuid, source text, title text, description text, categories text[], tags text[],
  url text, image_url text, venue_name text, address text, lat double precision, lng double precision,
  is_free boolean, price_min numeric, price_max numeric, currency text, price_note text,
  rsvp_required boolean, rsvp_note text, ticket_url text, involves_alcohol boolean, age_min smallint,
  accessible boolean, schedule_summary text, next_start timestamptz, next_end timestamptz, is_live boolean,
  distance_km double precision, rank real
)
language sql
stable
as $$
  with query as (
    select case when q is null or btrim(q) = '' then null
                else websearch_to_tsquery('english', q) end as tsq
  ),
  candidates as (
    select e.*, n.session_start, n.session_end,
           case when center_lat is null or center_lng is null then null
                else 6371 * 2 * asin(sqrt(
                       power(sin(radians(e.lat - center_lat) / 2), 2) +
                       cos(radians(center_lat)) * cos(radians(e.lat)) *
                       power(sin(radians(e.lng - center_lng) / 2), 2)))
           end as dist,
           case when query.tsq is null then 0::real else ts_rank(e.search, query.tsq) end as r
    from public.events e
    cross join query
    cross join lateral public.event_next_session(e.schedule, greatest(from_ts, now())) n
    where e.last_end_at > now()
      and n.session_start < to_ts
      and (query.tsq is null or e.search @@ query.tsq
           or e.title ilike '%' || q || '%')
      and (not free_only or e.is_free)
      and (max_price is null or e.is_free or coalesce(e.price_min, 0) <= max_price)
      and (cats is null or e.categories && cats)
  )
  select c.id, c.source, c.title, left(c.description, 600), c.categories, c.tags,
         c.url, c.image_url, c.venue_name, c.address, c.lat, c.lng,
         c.is_free, c.price_min, c.price_max, c.currency, c.price_note,
         c.rsvp_required, c.rsvp_note, c.ticket_url, c.involves_alcohol, c.age_min,
         c.accessible, c.schedule_summary, c.session_start, c.session_end,
         (c.session_start <= now() and c.session_end > now()),
         c.dist, c.r
  from candidates c
  where c.dist is null or c.dist <= radius_km
  order by c.r desc, c.dist nulls last, c.session_start
  limit least(lim, 60)
$$;

grant execute on function public.event_next_session(jsonb, timestamptz) to anon, authenticated;
grant execute on function public.events_in_bounds(double precision, double precision, double precision, double precision, timestamptz, timestamptz, boolean, text[], integer) to anon, authenticated;
grant execute on function public.search_events(text, timestamptz, timestamptz, double precision, double precision, double precision, boolean, numeric, text[], integer) to anon, authenticated;

-- Remove events whose final session ended, and expire cached Places data (Google ToS).
create or replace function public.purge_stale()
returns void
language sql
as $$
  delete from public.events where last_end_at < now() - interval '1 day';
  delete from public.places where fetched_at < now() - interval '30 days';
  delete from public.guide_usage where created_at < now() - interval '7 days';
$$;
