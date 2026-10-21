-- Hard monthly cap on Google Places searches (990 by default), so the 1,000 free a month are never crossed.
-- Each search reserves its slot first with take_quota(); the conditional update is atomic, so requests running at
-- the same time can't both take the last slot. Months follow Toronto time and reset on the 1st.

create table public.monthly_quota (
  service text not null,
  month   date not null,
  used    integer not null default 0 check (used >= 0),
  primary key (service, month)
);

alter table public.monthly_quota enable row level security; -- service role only

create or replace function public.toronto_month()
returns date
language sql
stable
as $$
  select (date_trunc('month', now() at time zone 'America/Toronto'))::date
$$;

-- Reserves one unit of this month's quota. True when reserved; false once `cap` units are used.
create or replace function public.take_quota(p_service text, p_cap integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved boolean;
begin
  insert into public.monthly_quota (service, month) values (p_service, public.toronto_month()) on conflict do nothing;
  update public.monthly_quota set used = used + 1
    where service = p_service and month = public.toronto_month() and used < p_cap
    returning true into reserved;
  return coalesce(reserved, false);
end
$$;

-- How much of this month's quota is used (0 when nothing has been reserved yet).
create or replace function public.quota_used(p_service text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select used from public.monthly_quota where service = p_service and month = public.toronto_month()), 0)
$$;

revoke all on function public.take_quota(text, integer) from public, anon, authenticated;
revoke all on function public.quota_used(text) from public, anon, authenticated;

-- Start this month's count from the searches already metered since metering began.
insert into public.monthly_quota (service, month, used)
select 'google_places', public.toronto_month(), coalesce(sum(units), 0)::integer
from public.api_usage
where service = 'google_places'
  and created_at >= (public.toronto_month()::timestamp at time zone 'America/Toronto')
on conflict (service, month) do update set used = excluded.used;
