-- Public comments on each spot (an event or a place), with a report button and automatic hiding.
-- The tables have no policies: everything goes through the functions below, which check input and never
-- expose who wrote a comment (only its nickname). Place ids are Google place ids, which may be stored.

create table public.spot_comments (
  id           bigint generated always as identity primary key,
  item_kind    text not null check (item_kind in ('event', 'place')),
  item_id      text not null check (char_length(item_id) between 1 and 200),
  owner        uuid not null,
  nickname     text not null check (char_length(btrim(nickname)) between 1 and 30),
  body         text not null check (char_length(btrim(body)) between 1 and 500),
  report_count integer not null default 0 check (report_count >= 0),
  hidden       boolean not null default false,
  created_at   timestamptz not null default now()
);

create index spot_comments_item_idx on public.spot_comments (item_kind, item_id, created_at desc);
create index spot_comments_owner_idx on public.spot_comments (owner, created_at desc);

create table public.comment_reports (
  comment_id bigint not null references public.spot_comments (id) on delete cascade,
  reporter   uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter)
);

alter table public.spot_comments enable row level security;
alter table public.comment_reports enable row level security;

-- How many reports from different people hide a comment. A report from the team hides it straight away.
create or replace function public.comment_hide_threshold()
returns integer
language sql
immutable
as $$ select 3 $$;

-- Visible comments on one spot, newest first, with whether each one is the caller's own (so they can delete it).
create or replace function public.spot_comments_for(p_kind text, p_item_id text)
returns table (id bigint, nickname text, body text, created_at timestamptz, mine boolean)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nickname, c.body, c.created_at, (c.owner = auth.uid()) as mine
  from public.spot_comments c
  where c.item_kind = p_kind and c.item_id = p_item_id and not c.hidden
  order by c.created_at desc
  limit 50
$$;

-- Posts a comment. Errors are short, readable messages the app shows as they are.
create or replace function public.add_spot_comment(p_kind text, p_item_id text, p_nickname text, p_body text)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  new_id bigint;
  nick text := btrim(coalesce(p_nickname, ''));
  msg text := btrim(coalesce(p_body, ''));
begin
  if auth.uid() is null then raise exception 'Sign in to comment.'; end if;
  if p_kind not in ('event', 'place') or coalesce(p_item_id, '') = '' then raise exception 'That spot can''t take comments.'; end if;
  if char_length(nick) not between 1 and 30 then raise exception 'Pick a nickname of up to 30 characters.'; end if;
  if char_length(msg) not between 1 and 500 then raise exception 'Comments are 1 to 500 characters.'; end if;
  if msg ~* '(https?://|www\.|\.(com|ca|net|org|io|co)\b)' or nick ~* '(https?://|www\.)' then
    raise exception 'Links aren''t allowed in comments.';
  end if;
  if (select count(*) from public.spot_comments where owner = auth.uid() and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'That''s a lot of comments for one hour. Try again a bit later.';
  end if;
  insert into public.spot_comments (item_kind, item_id, owner, nickname, body)
  values (p_kind, p_item_id, auth.uid(), nick, msg)
  returning id into new_id;
  return new_id;
end
$$;

-- Reports a comment once per person. Hides it at the threshold, or at once when the team reports it.
create or replace function public.report_comment(p_comment_id bigint)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  reports integer;
begin
  if auth.uid() is null then raise exception 'Sign in to report.'; end if;
  insert into public.comment_reports (comment_id, reporter) values (p_comment_id, auth.uid()) on conflict do nothing;
  select count(*) into reports from public.comment_reports where comment_id = p_comment_id;
  update public.spot_comments
    set report_count = reports,
        hidden = hidden or reports >= public.comment_hide_threshold() or public.is_team(auth.uid())
    where id = p_comment_id;
  return true;
end
$$;

-- Deletes the caller's own comment.
create or replace function public.delete_my_comment(p_comment_id bigint)
returns boolean
language sql
volatile
security definer
set search_path = public
as $$
  with gone as (delete from public.spot_comments where id = p_comment_id and owner = auth.uid() returning 1)
  select exists (select 1 from gone)
$$;

revoke all on function public.spot_comments_for(text, text) from public;
revoke all on function public.add_spot_comment(text, text, text, text) from public, anon;
revoke all on function public.report_comment(bigint) from public, anon;
revoke all on function public.delete_my_comment(bigint) from public, anon;
grant execute on function public.spot_comments_for(text, text) to anon, authenticated;
grant execute on function public.add_spot_comment(text, text, text, text) to authenticated;
grant execute on function public.report_comment(bigint) to authenticated;
grant execute on function public.delete_my_comment(bigint) to authenticated;

-- Every comment for the usage sheet's Comments tab (service role only): event titles where known; places by id.
create or replace function public.comments_report()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(json_agg(r order by r.created_at desc), '[]'::json) from (
    select c.created_at,
           to_char(c.created_at at time zone 'America/Toronto', 'YYYY-MM-DD HH24:MI') as created,
           c.item_kind, c.item_id,
           (select e.title from public.events e where c.item_kind = 'event' and e.id::text = c.item_id) as event_title,
           c.nickname, c.body, c.report_count, c.hidden,
           case when public.is_team(c.owner) then 'Team' else 'User' end as source
    from public.spot_comments c
    order by c.created_at desc
    limit 2000
  ) r
$$;

revoke all on function public.comments_report() from public, anon, authenticated;
