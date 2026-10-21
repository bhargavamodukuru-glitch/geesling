-- Security fixes, step 2 of 2 (apply once the web app reads walks through get_walk).
-- Walks are no longer readable as a table: nobody can list other people's prompts.
-- Share links keep working through public.get_walk(id); the guide and the usage report use the service role.
drop policy if exists "walks are public" on public.walks;
