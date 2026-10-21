-- Metered usage of paid services, so the Costs tab can show how much of each free allowance is left.
-- Google and Anthropic don't expose live counters to the app, so Geesling counts its own calls as it makes them.
-- Rows are kept (not purged) so month-to-date totals stay complete.

create table public.api_usage (
  id         bigint generated always as identity primary key,
  service    text not null,  -- google_places, google_routes, google_maps_js, anthropic, supabase_functions
  sku        text not null,  -- what the provider bills, e.g. text_search_enterprise_atmosphere, claude-haiku-5-5:output
  units      bigint not null check (units >= 0),
  created_at timestamptz not null default now()
);

create index api_usage_month_idx on public.api_usage (created_at, service, sku);

-- Written by the guide (service role) and by log_map_load(); nobody reads it except the usage report.
alter table public.api_usage enable row level security;

-- One web map load = one Google "Dynamic Maps" billable event. Called by the web app when the map starts.
create or replace function public.log_map_load()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  insert into public.api_usage (service, sku, units) values ('google_maps_js', 'dynamic_maps', 1)
$$;

revoke all on function public.log_map_load() from public;
grant execute on function public.log_map_load() to anon, authenticated;

-- Month-to-date usage (Toronto calendar month), plus the Supabase numbers the database itself can report.
create or replace function public.cost_report()
returns json
language sql
stable
as $$
  with month as (
    select date_trunc('month', now() at time zone 'America/Toronto') at time zone 'America/Toronto' as start
  )
  select json_build_object(
    'month_start', (select to_char(start at time zone 'America/Toronto', 'YYYY-MM-DD') from month),
    'days_elapsed', (select extract(epoch from now() - start) / 86400 from month),
    'days_in_month', extract(day from (date_trunc('month', now() at time zone 'America/Toronto') + interval '1 month - 1 day')),
    'metering_since', (select to_char(min(created_at) at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') from public.api_usage),
    'usage', (
      select coalesce(json_agg(u), '[]'::json) from (
        select service, sku, sum(units)::bigint as units
        from public.api_usage, month
        where created_at >= month.start
        group by service, sku
      ) u
    ),
    'db_bytes', pg_database_size(current_database()),
    'monthly_active_users', (select count(*) from auth.users, month where last_sign_in_at >= month.start),
    'total_users', (select count(*) from auth.users)
  )
$$;

revoke all on function public.cost_report() from public, anon, authenticated;
