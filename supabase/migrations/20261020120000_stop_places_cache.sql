-- Geesling no longer stores Google Places content: Google's policy allows storing place IDs only,
-- and nothing in the app read this table. Remove what was cached (names, addresses, ratings, hours, summaries).
-- The table itself is kept, empty, so earlier migrations and purge_stale() stay valid.
delete from public.places;

comment on table public.places is
  'Unused and kept empty. Do not store Google Places content here; Google allows storing place IDs only.';
