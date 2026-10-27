-- Fixes from the 2026-10-27 security audit (~/security-audit-skill/geesling/run-1).

-- 1. Event links are web links only. A `javascript:` or other scheme from a feed could otherwise run in the
--    app when someone taps Website/RSVP. Ingest now drops them (ingest/lib/url.ts); clear any already stored
--    and refuse new ones.
update public.events set url = null where url is not null and url !~* '^https?://';
update public.events set ticket_url = null where ticket_url is not null and ticket_url !~* '^https?://';
update public.events set image_url = null where image_url is not null and image_url !~* '^https?://';

alter table public.events
  add constraint events_links_are_web check (
    (url is null or url ~* '^https?://')
    and (ticket_url is null or ticket_url ~* '^https?://')
    and (image_url is null or image_url ~* '^https?://')
  );

-- 2. Moderation power comes only from the team link (team_accounts). is_team() also counts command-line
--    sign-ins and the owner's network, which is fine for colouring rows in the usage sheet, but a User-Agent
--    is chosen by the client, so it must not decide who can hide comments.
create or replace function public.is_team_member(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.team_accounts t where t.owner = p_owner)
$$;

revoke all on function public.is_team_member(uuid) from public, anon, authenticated;

-- 3. Reports from ordinary accounts no longer hide a comment on their own: anonymous accounts are free, so
--    "3 different people" could be one person. At the review threshold the comment shows as "Needs review"
--    in the usage sheet's Comments tab, and one report from a team member hides it.
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
        hidden = hidden or public.is_team_member(auth.uid())
    where id = p_comment_id;
  return true;
end
$$;

revoke all on function public.report_comment(bigint) from public, anon;
grant execute on function public.report_comment(bigint) to authenticated;

-- 4. A share link shows the route, not where its creator was when they asked for it.
create or replace function public.get_walk(walk_id text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select (to_jsonb(w) - array['owner', 'start_lat', 'start_lng'])::json from public.walks w where w.id = walk_id
$$;

revoke all on function public.get_walk(text) from public;
grant execute on function public.get_walk(text) to anon, authenticated;
