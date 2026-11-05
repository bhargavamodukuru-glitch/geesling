-- Daily emails: one row per email sent (kind + Toronto day), so the backup schedule runs see it's done and stop before
-- starting a browser. Thank-you emails: when each person got theirs, so nobody gets two.
-- (supabase/functions/daily-emails, scripts/render-email.mjs)

create table if not exists public.email_sends (
  kind       text not null check (kind in ('morning', 'neighbourhood', 'evening')),
  day        date not null,
  recipients int not null default 0,
  sent       int not null default 0,
  picture    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (kind, day)
);
alter table public.email_sends enable row level security;
revoke all on public.email_sends from anon, authenticated;

alter table public.profiles add column if not exists welcome_sent_at timestamptz;
-- Everyone who signed up before thank-you emails existed already gets the daily emails; no thank-you for them.
update public.profiles set welcome_sent_at = now() where welcome_sent_at is null;
