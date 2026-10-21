-- Beta feedback sent from the app's Beta Feedback tab.
-- People can add feedback but never read it back; the usage report (service role) shares it to the Google Sheet.

create table public.feedback (
  id         bigint generated always as identity primary key,
  owner      uuid not null default auth.uid(),
  rating     smallint check (rating between 1 and 3), -- 3 love it, 2 okay, 1 not great; optional
  message    text not null check (char_length(btrim(message)) between 1 and 2000),
  contact    text check (contact is null or char_length(contact) <= 200),
  platform   text check (platform is null or char_length(platform) <= 40),
  created_at timestamptz not null default now()
);

create index feedback_owner_recent on public.feedback (owner, created_at desc);

alter table public.feedback enable row level security;

-- Counts this person's recent feedback without giving them read access to the table.
create or replace function public.feedback_sent_recently()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer from public.feedback where owner = auth.uid() and created_at > now() - interval '1 hour'
$$;

revoke all on function public.feedback_sent_recently() from public, anon;
grant execute on function public.feedback_sent_recently() to authenticated;

-- Insert only, as yourself, at most 5 an hour (a light guard against spam from one anonymous session).
create policy "send own feedback" on public.feedback for insert to authenticated
  with check (owner = auth.uid() and public.feedback_sent_recently() < 5);

-- The usage report now includes feedback for the sheet's Beta Feedback tab.
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
               total_minutes, time_budget_minutes
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
               rating, message, contact, platform
        from public.feedback
        order by created_at desc
        limit 2000
      ) f
    )
  )
$$;


revoke all on function public.usage_report() from public, anon, authenticated;
