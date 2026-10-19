-- Select only event sessions that overlap the requested time window.
-- Passing from_ts (rather than greatest(from_ts, now())) lets a calendar date
-- in the future skip earlier occurrences of a recurring event.
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
  cross join lateral public.event_next_session(e.schedule, from_ts) n
  where e.last_end_at > now()
    and e.lat between min_lat and max_lat
    and e.lng between min_lng and max_lng
    and n.session_start < to_ts
    and n.session_end > from_ts
    and (not free_only or e.is_free)
    and (cats is null or e.categories && cats)
  order by n.session_start
  limit least(lim, 1000)
$$;
