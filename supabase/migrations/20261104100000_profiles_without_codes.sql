-- Profiles without sign-in codes: the form saves email, phone and demographics straight against the device's
-- anonymous account. Nothing is verified, so the email may be mistyped; it's for understanding who uses Geesling
-- (and for updates when they opt in), not for signing in.

drop function if exists public.save_profile(text, text, text, boolean);

create or replace function public.save_profile(p_email text, p_phone text, p_persona text, p_age_range text, p_marketing boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  clean_email text := lower(btrim(p_email));
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' then raise exception 'Enter a valid email address.'; end if;

  insert into public.profiles as p (owner, email, phone, persona, age_range, marketing_opt_in, marketing_consent_at)
  values (auth.uid(), clean_email, nullif(btrim(p_phone), ''), p_persona, p_age_range, coalesce(p_marketing, false),
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

-- Forgets just the details (the person keeps using Geesling anonymously).
create or replace function public.delete_my_profile()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  delete from public.profiles where owner = auth.uid()
$$;

revoke all on function public.save_profile(text, text, text, text, boolean) from public, anon;
revoke all on function public.delete_my_profile() from public, anon;
grant execute on function public.save_profile(text, text, text, text, boolean) to authenticated;
grant execute on function public.delete_my_profile() to authenticated;
