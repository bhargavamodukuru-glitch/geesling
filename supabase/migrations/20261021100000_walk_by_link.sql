-- Security fixes, step 1 of 2 (safe to apply before the web app changes).

-- A walk can be opened by its share link (its random 10-character id), without anyone being able to list walks.
-- Returns the walk without its owner, or null when the id is unknown.
create or replace function public.get_walk(walk_id text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select (to_jsonb(w) - 'owner')::json from public.walks w where w.id = walk_id
$$;

revoke all on function public.get_walk(text) from public;
grant execute on function public.get_walk(text) to anon, authenticated;

-- purge_stale is for the ingest job (service role) only.
revoke all on function public.purge_stale() from public, anon, authenticated;

-- The guide's daily cap counts every walk request in the last 24 hours.
create index if not exists guide_usage_created_idx on public.guide_usage (created_at desc);
