-- Postgres regexes mark a word boundary with \y, not \b (which means backspace there), so the no-links check
-- in add_spot_comment let "spam.com" through. Same function, corrected pattern.
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
  if msg ~* '(https?://|www\.|\.(com|ca|net|org|io|co)\y)' or nick ~* '(https?://|www\.)' then
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

