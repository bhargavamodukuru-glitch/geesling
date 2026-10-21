-- cost_report reads auth.users for monthly active users, which the service role can't read directly.
-- Run it with its owner's rights; it stays callable only by the service role (the usage report).
alter function public.cost_report() security definer set search_path = public;
revoke all on function public.cost_report() from public, anon, authenticated;
