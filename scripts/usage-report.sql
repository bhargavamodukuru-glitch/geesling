-- Geesling usage report: goose requests, walks, daily counts, top stops.
-- Run: npm run usage   (needs `supabase login` + `supabase link`)
select json_build_object(
 'summary', (select json_build_object(
    'requests', (select count(*) from guide_usage),
    'walks', (select count(*) from walks),
    'users', (select count(distinct owner) from guide_usage),
    'saved', (select count(*) from saved_items),
    'events_live', (select count(*) from events where last_end_at > now()),
    'last_ingest', (select to_char(finished_at at time zone 'America/Toronto','YYYY-MM-DD HH24:MI') from ingestion_runs where finished_at is not null order by finished_at desc limit 1),
    'first_request', (select to_char(min(created_at) at time zone 'America/Toronto','YYYY-MM-DD HH24:MI') from guide_usage))),
 'daily', (select coalesce(json_agg(d order by d.day),'[]') from (
    select to_char(day,'YYYY-MM-DD') as day, sum(req) as requests, sum(wk) as walks, max(users) as users from (
      select (created_at at time zone 'America/Toronto')::date as day, count(*) as req, 0 as wk, count(distinct owner) as users from guide_usage group by 1
      union all
      select (created_at at time zone 'America/Toronto')::date, 0, count(*), 0 from walks group by 1) x group by day) d),
 'walks', (select coalesce(json_agg(w order by w.created desc),'[]') from (
    select to_char(created_at at time zone 'America/Toronto','YYYY-MM-DD HH24:MI') as created, id, prompt, title,
      jsonb_array_length(stops) as stops, total_minutes, time_budget_minutes,
      (select count(*) from jsonb_array_elements(stops) s where (s->'item'->>'is_free')::boolean) as free_stops,
      (select count(*) from jsonb_array_elements(stops) s where s->>'kind'='event') as event_stops
    from walks) w),
 'top_stops', (select coalesce(json_agg(t),'[]') from (
    select coalesce(s->'item'->>'title', s->'item'->>'name') as name, s->>'kind' as kind, count(*) as picks
    from walks, jsonb_array_elements(stops) s group by 1,2 order by 3 desc, 1 limit 25) t)
) as report;
