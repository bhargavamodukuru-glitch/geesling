-- torevent.ca joins the event sources (ingest/sources/torevent.ts).
alter table public.events drop constraint if exists events_source_check;
alter table public.events add constraint events_source_check
  check (source in ('toronto', 'ticketmaster', 'eventbrite', 'torevent'));

-- Venue addresses already placed on the map (ingest/lib/geocode.ts), so each is looked up with OpenStreetMap once.
-- lat/lng are null when the address wasn't found; it's tried again after two weeks. Service role only.
create table if not exists public.venue_locations (
  key          text primary key,
  lat          double precision,
  lng          double precision,
  looked_up_at timestamptz not null default now()
);
alter table public.venue_locations enable row level security;
revoke all on public.venue_locations from anon, authenticated;
