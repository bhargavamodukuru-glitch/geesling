-- Optional accounts: who Geesling's users are. Signing up turns the device's anonymous account into an email
-- account (same user id, so saved spots and routes carry over). The email comes from Supabase Auth once the
-- 6-digit code is confirmed; the phone isn't verified. Marketing messages need the explicit opt-in (CASL).

create table public.profiles (
  owner                uuid primary key,          -- auth.users.id
  email                text not null,
  phone                text check (phone is null or phone ~ '^\+?[0-9 ().-]{7,20}$'),
  persona              text check (persona in ('student', 'newcomer', 'tourist', 'local')),
  age_range            text check (age_range in ('under_18', '18_24', '25_30', '31_40', '41_plus')),
  marketing_opt_in     boolean not null default false,
  marketing_consent_at timestamptz,               -- when they ticked the box; null when they haven't or withdrew
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- Nobody reads or writes the table directly: only the functions below and the service role (usage report).
alter table public.profiles enable row level security;

-- Saves the signed-in person's profile. Refuses anonymous accounts: the email must be confirmed first.
create or replace function public.save_profile(p_phone text, p_persona text, p_age_range text, p_marketing boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  confirmed_email text;
begin
  select u.email into confirmed_email
    from auth.users u
   where u.id = auth.uid() and u.email is not null and u.email_confirmed_at is not null and not coalesce(u.is_anonymous, false);
  if confirmed_email is null then raise exception 'Confirm your email first.'; end if;

  insert into public.profiles as p (owner, email, phone, persona, age_range, marketing_opt_in, marketing_consent_at)
  values (auth.uid(), confirmed_email, nullif(btrim(p_phone), ''), p_persona, p_age_range, coalesce(p_marketing, false),
          case when p_marketing then now() end)
  on conflict (owner) do update set
    email = excluded.email,
    phone = excluded.phone,
    persona = excluded.persona,
    age_range = excluded.age_range,
    marketing_opt_in = excluded.marketing_opt_in,
    -- Keep the original consent time while it stays on; clear it when they opt out.
    marketing_consent_at = case when excluded.marketing_opt_in then coalesce(p.marketing_consent_at, now()) end,
    updated_at = now();
end
$$;

-- The signed-in person's own profile, or nothing.
create or replace function public.my_profile()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(p)::json from public.profiles p where p.owner = auth.uid()
$$;

-- Deletes the account and everything tied to it (required by the App Store once accounts can be created).
-- Shared routes and comments go too, since they carry the owner's id.
create or replace function public.delete_my_account()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first.'; end if;
  delete from public.profiles where owner = me;
  delete from public.saved_items where owner = me;
  delete from public.walks where owner = me;
  delete from public.spot_comments where owner = me;
  delete from public.comment_reports where reporter = me;
  delete from public.feedback where owner = me;
  delete from public.guide_usage where owner = me;
  delete from public.team_accounts where owner = me;
  delete from auth.users where id = me;
end
$$;

revoke all on function public.save_profile(text, text, text, boolean) from public, anon;
revoke all on function public.my_profile() from public, anon;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.save_profile(text, text, text, boolean) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- For the usage report's Users tab (service role only): each signed-up person and how much they use Geesling.
create or replace function public.users_report()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(r order by r.joined desc), '[]'::json)
  from (
    select to_char(p.created_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') as joined,
           p.created_at,
           p.email, p.phone, p.persona, p.age_range, p.marketing_opt_in,
           to_char(p.marketing_consent_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') as consent_at,
           (select count(*) from public.walks w where w.owner = p.owner) as routes,
           (select to_char(max(w.created_at) at time zone 'America/Toronto', 'YYYY-MM-DD') from public.walks w where w.owner = p.owner) as last_route
    from public.profiles p
  ) r
$$;

revoke all on function public.users_report() from public, anon, authenticated;
grant execute on function public.users_report() to service_role;
