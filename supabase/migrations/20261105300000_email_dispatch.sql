-- Start Geesling's email jobs from Supabase instead of relying on GitHub's scheduler, which dropped every scheduled
-- email run on its first day (supabase/functions/email-dispatch).
--   * the moment someone saves the form with the updates box ticked (and hasn't been thanked), a thank-you run starts
--   * pg_cron calls the dispatcher at 9 am, noon and 5 pm Toronto (both EDT and EST hours, with retries at :10 and :20;
--     the dispatcher only starts a run when an email is actually due and not yet sent), and every 10 minutes as a
--     catch-up for thank-yous
-- The dispatcher is public and needs no secret here: it only starts a run when there's real work, at most once a minute.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- When each job was last started, so repeated calls don't start duplicate runs.
create table if not exists public.email_dispatches (
  job text primary key,
  at  timestamptz not null default now()
);
alter table public.email_dispatches enable row level security;
revoke all on public.email_dispatches from anon, authenticated;

create or replace function public.dispatch_welcome_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.marketing_opt_in and new.welcome_sent_at is null
     and (tg_op = 'INSERT' or old.marketing_opt_in is distinct from new.marketing_opt_in) then
    -- Asynchronous: saving the form never waits on this.
    perform net.http_post(
      url := 'https://agmizhktrsaehtsrtzsp.supabase.co/functions/v1/email-dispatch?welcome=1',
      body := '{}'::jsonb,
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  end if;
  return new;
end;
$$;
revoke all on function public.dispatch_welcome_email() from public, anon, authenticated;

drop trigger if exists profiles_dispatch_welcome on public.profiles;
create trigger profiles_dispatch_welcome
  after insert or update of marketing_opt_in on public.profiles
  for each row execute function public.dispatch_welcome_email();

-- 9 am (13/14 UTC), noon (16/17 UTC), 5 pm (21/22 UTC) Toronto, whichever of EDT/EST applies; :10 and :20 retry.
select cron.schedule(
  'geesling-daily-emails',
  '0,10,20 13,14,16,17,21,22 * * *',
  $$ select net.http_post(url := 'https://agmizhktrsaehtsrtzsp.supabase.co/functions/v1/email-dispatch?daily=1', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb) $$
);
select cron.schedule(
  'geesling-welcome-catchup',
  '*/10 * * * *',
  $$ select net.http_post(url := 'https://agmizhktrsaehtsrtzsp.supabase.co/functions/v1/email-dispatch?welcome=1', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb) $$
);
