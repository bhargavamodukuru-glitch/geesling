-- Tell the team's own requests (the owner's devices and Claude's test scripts) apart from real users,
-- so the usage sheet can highlight team rows.
-- Team = an account in team_accounts (added by opening the app with the private ?team=<code> link, or marked by hand),
-- or an account created from the command line (curl or Node test scripts; real users always come from the app).
-- The code itself is never stored here: only its SHA-256, set outside the repo (team_code).

create table public.team_accounts (
  owner    uuid primary key,
  reason   text not null,
  added_at timestamptz not null default now()
);

create table public.team_code (
  id   boolean primary key default true check (id), -- a single row
  hash text not null
);

alter table public.team_accounts enable row level security; -- service role only
alter table public.team_code enable row level security;

create or replace function public.is_team(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.team_accounts where owner = p_owner)
      or exists (select 1 from auth.sessions where user_id = p_owner and (user_agent ilike 'curl/%' or user_agent ilike 'node%' or user_agent ilike 'Deno/%'))
$$;

-- Marks the signed-in account as team when the code matches. Returns whether it did.
create or replace function public.join_team(code text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.team_code where hash = encode(extensions.digest(coalesce(code, ''), 'sha256'), 'hex')
  ) then
    return false;
  end if;
  insert into public.team_accounts (owner, reason) values (auth.uid(), 'team link') on conflict (owner) do nothing;
  return true;
end
$$;

revoke all on function public.is_team(uuid) from public, anon, authenticated;
revoke all on function public.join_team(text) from public, anon;
grant execute on function public.join_team(text) to authenticated;

-- The usage report labels walks and feedback Team or User, and counts real users separately.
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
               case when public.is_team(owner) then 'Team' else 'User' end as source
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
