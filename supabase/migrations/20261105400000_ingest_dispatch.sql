-- The event import (ingest.yml) every 3 hours from pg_cron through email-dispatch, instead of GitHub's scheduler,
-- which ran it only 3–4 times a day and often late. GitHub's own schedule stays as a backup; the dispatcher starts
-- at most one import per 2½ hours and the workflow never runs two at once.
select cron.schedule(
  'geesling-event-import',
  '17 */3 * * *',
  $$ select net.http_post(url := 'https://agmizhktrsaehtsrtzsp.supabase.co/functions/v1/email-dispatch?ingest=1', body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb) $$
);
