-- Web push for the morning and after-work heads-ups (src/lib/push.ts, supabase/functions/push-alerts).
-- A subscription is a browser's push address. Alerts go only to subscriptions whose owner has also ticked
-- "Send me Geesling updates" (profiles.marketing_opt_in); unticking it or deleting their details removes them.

create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  owner        uuid not null references auth.users (id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz
);
create index if not exists push_subscriptions_owner on public.push_subscriptions (owner);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- One row per alert sent (kind + Toronto date), so a retried or duplicated schedule never sends twice.
create table if not exists public.push_sends (
  kind       text not null check (kind in ('morning', 'evening')),
  day        date not null,
  sent       int not null default 0,
  failed     int not null default 0,
  title      text,
  body       text,
  created_at timestamptz not null default now(),
  primary key (kind, day)
);
alter table public.push_sends enable row level security;
revoke all on public.push_sends from anon, authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_endpoint !~ '^https://' or length(p_endpoint) > 1000 or length(p_p256dh) > 200 or length(p_auth) > 100 then
    raise exception 'invalid subscription';
  end if;
  insert into public.push_subscriptions (endpoint, owner, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set owner = excluded.owner, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

create or replace function public.delete_my_push_subscriptions()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where owner = auth.uid()
$$;

-- "Delete my details" now also stops every notification.
create or replace function public.delete_my_profile()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where owner = auth.uid();
  delete from public.profiles where owner = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text) from public, anon;
revoke all on function public.delete_my_push_subscriptions() from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
grant execute on function public.delete_my_push_subscriptions() to authenticated;

-- For push-alerts (service role): who to send to, and the numbers the alerts quote.
create or replace function public.push_recipients()
returns table (endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = public
as $$
  select s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  join public.profiles p on p.owner = s.owner
  where p.marketing_opt_in
$$;
revoke all on function public.push_recipients() from public, anon, authenticated;

-- Counts for an alert: what's on in the Toronto-time window [from_hour, to_hour) today, and events added in the last
-- day (the schedule is a list of sessions, so an event counts if any session overlaps the window).
create or replace function public.push_numbers(from_hour int, to_hour int)
returns json
language sql
stable
security definer
set search_path = public
as $$
  with bounds as (
    select ((date_trunc('day', now() at time zone 'America/Toronto') + make_interval(hours => from_hour)) at time zone 'America/Toronto') as w_from,
           ((date_trunc('day', now() at time zone 'America/Toronto') + make_interval(hours => to_hour)) at time zone 'America/Toronto') as w_to
  ),
  on_now as (
    select e.* from public.events e, bounds b
    where e.last_end_at > now()
      and exists (select 1 from jsonb_array_elements(e.schedule) s
                  where (s->>'start')::timestamptz < b.w_to and (s->>'end')::timestamptz > b.w_from)
  )
  select json_build_object(
    'total', (select count(*) from on_now),
    'free', (select count(*) from on_now where is_free),
    'music', (select count(*) from on_now where 'music' = any(categories)),
    'new_day', (select count(*) from public.events where created_at > now() - interval '24 hours' and last_end_at > now()),
    'new_free_day', (select count(*) from public.events where created_at > now() - interval '24 hours' and last_end_at > now() and is_free)
  )
$$;
revoke all on function public.push_numbers(int, int) from public, anon, authenticated;
