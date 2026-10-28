-- City of Toronto open data spots (Open Government Licence – Toronto): public art, StrollTO and Cultural Hotspot
-- points of interest, attractions, music venues, drinking water, CaféTO patios and fall-colour streets.
-- Filled by ingest/city-spots.ts (service role). Free to search, so the guide uses them before Google Places.

create table public.city_spots (
  id          text primary key,             -- "<source>:<source id>", stable across imports
  source      text not null,                -- dataset, e.g. 'public-art'
  kind        text not null check (kind in ('art', 'landmark', 'stroll', 'culture', 'music_venue', 'water', 'patio', 'fall_colours')),
  name        text not null,
  description text,
  address     text,
  lat         double precision not null,
  lng         double precision not null,
  website     text check (website is null or website ~* '^https?://'),
  image_url   text check (image_url is null or image_url ~* '^https?://'),
  details     jsonb not null default '{}'::jsonb, -- dataset-specific extras (artist, capacity, status, tree counts…)
  run_id      uuid,
  updated_at  timestamptz not null default now(),
  search      tsvector generated always as (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '') || ' ' || coalesce(address, '') || ' ' || kind)
  ) stored
);

create index city_spots_kind_idx on public.city_spots (kind);
create index city_spots_latlng_idx on public.city_spots (lat, lng);
create index city_spots_search_idx on public.city_spots using gin (search);

alter table public.city_spots enable row level security;
create policy "city spots are public" on public.city_spots for select using (true);

-- Guide query: full-text and distance search over city spots, nearest first.
create or replace function public.search_city_spots(
  q text default null,
  center_lat double precision default null,
  center_lng double precision default null,
  radius_m double precision default 1500,
  kinds text[] default null,
  lim integer default 15
)
returns table (
  id text, source text, kind text, name text, description text, address text,
  lat double precision, lng double precision, website text, image_url text, details jsonb, distance_m double precision
)
language sql
stable
as $$
  with query as (
    select case when q is null or btrim(q) = '' then null else websearch_to_tsquery('english', q) end as tsq
  ),
  candidates as (
    select s.*,
           case when center_lat is null or center_lng is null then null
                else 6371000 * 2 * asin(sqrt(
                       power(sin(radians(s.lat - center_lat) / 2), 2) +
                       cos(radians(center_lat)) * cos(radians(s.lat)) *
                       power(sin(radians(s.lng - center_lng) / 2), 2)))
           end as dist,
           case when query.tsq is null then 0::real else ts_rank(s.search, query.tsq) end as r
    from public.city_spots s
    cross join query
    where (kinds is null or s.kind = any(kinds))
      and (query.tsq is null or s.search @@ query.tsq or s.name ilike '%' || q || '%')
      -- A cheap box first, so the distance only runs on nearby rows.
      and (center_lat is null or center_lng is null or (
            s.lat between center_lat - radius_m / 111000.0 and center_lat + radius_m / 111000.0
        and s.lng between center_lng - radius_m / 80000.0 and center_lng + radius_m / 80000.0))
  )
  select c.id, c.source, c.kind, c.name, left(c.description, 400), c.address, c.lat, c.lng, c.website, c.image_url, c.details, c.dist
  from candidates c
  where c.dist is null or c.dist <= radius_m
  order by c.r desc, c.dist nulls last
  limit least(greatest(lim, 1), 40)
$$;

grant execute on function public.search_city_spots(text, double precision, double precision, double precision, text[], integer) to anon, authenticated;
