-- Routes planned through the private beta (geesling--beta.expo.app, guide function geesling-beta) are labelled 'beta',
-- so the usage sheet can show which version each route came from. Everything else stays 'live'.
alter table public.walks add column if not exists channel text not null default 'live' check (channel in ('live', 'beta'));

-- The usage report adds a Version column (Live / Beta) and counts routes by end users vs the team.
create or replace function public.usage_report()
returns json
language sql
stable
as $$
  select json_build_object(
    'summary', json_build_object(
      'refreshed_at', to_char(now() at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI'),
      'requests', (select count(*) from public.guide_usage),
      'walks', (select count(*) from public.walks),
      'users', (select count(distinct owner) from public.guide_usage),
      'real_users', (select count(distinct owner) from public.guide_usage where not public.is_team(owner)),
      'routes_end_users', (select count(*) from public.walks where not public.is_team(owner)),
      'routes_team', (select count(*) from public.walks where public.is_team(owner)),
      'routes_beta_end_users', (select count(*) from public.walks where channel = 'beta' and not public.is_team(owner)),
      'saved', (select count(*) from public.saved_items),
      'events_live', (select count(*) from public.events where last_end_at > now()),
      'last_ingest', (select to_char(finished_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI')
                      from public.ingestion_runs where finished_at is not null
                      order by finished_at desc limit 1)
    ),
    'daily', (
      select coalesce(json_agg(d order by d.day), '[]'::json) from (
        select to_char(day, 'YYYY-MM-DD') as day, sum(req) as requests, sum(wk) as walks, max(users) as users
        from (
          select (created_at at time zone 'America/Toronto')::date as day, count(*) as req, 0 as wk,
                 count(distinct owner) as users
          from public.guide_usage group by 1
          union all
          select (created_at at time zone 'America/Toronto')::date, 0, count(*), 0
          from public.walks group by 1
        ) x
        group by day
      ) d
    ),
    'walks', (
      select coalesce(json_agg(w order by w.created_at desc), '[]'::json) from (
        select created_at,
               to_char(created_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') as created,
               id, prompt, title,
               jsonb_array_length(stops) as stops,
               (select count(*) from jsonb_array_elements(stops) s where s->>'kind' = 'event') as event_stops,
               (select count(*) from jsonb_array_elements(stops) s where (s->'item'->>'is_free')::boolean) as free_stops,
               total_minutes, time_budget_minutes,
               case when public.is_team(owner) then 'Team' else 'User' end as source,
               case when channel = 'beta' then 'Beta' else 'Live' end as version
        from public.walks
        order by created_at desc
        limit 2000
      ) w
    ),
    'top_stops', (
      select coalesce(json_agg(t), '[]'::json) from (
        select coalesce(s->'item'->>'title', s->'item'->>'name') as name, s->>'kind' as kind, count(*) as picks
        from public.walks, jsonb_array_elements(stops) s
        group by 1, 2
        order by 3 desc, 1
        limit 100
      ) t
    ),
    'feedback', (
      select coalesce(json_agg(f order by f.created_at desc), '[]'::json) from (
        select created_at,
               to_char(created_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') as created,
               rating, message, contact, platform,
               case when public.is_team(owner) then 'Team' else 'User' end as source
        from public.feedback
        order by created_at desc
        limit 2000
      ) f
    )
  )
$$;


revoke all on function public.usage_report() from public, anon, authenticated;
