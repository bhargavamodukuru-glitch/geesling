// Starts Geesling's email jobs on GitHub Actions right when they're needed, instead of waiting for GitHub's own
// scheduler (which ran 0 of the thank-you checks and 0 of the noon backups on its first day).
//   POST ?welcome=1  → if anyone has opted in and not been thanked, start welcome-emails.yml
//   POST ?daily=1    → if a daily email is due now in Toronto and hasn't gone out today, start daily-emails.yml
// Called by a database trigger the moment someone saves the form with the updates box ticked (welcome), and by
// pg_cron at 9 am, noon and 5 pm Toronto plus a 10-minute catch-up (migration 20261105300000).
// Public (verify_jwt = false), but it only ever starts a run when there's real work, and at most one per job per
// minute or so (public.email_dispatches), so calling it can't do more than the schedule would.
// The GitHub token (GITHUB_DISPATCH_TOKEN) is a fine-grained token limited to this repository's Actions.
import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { dueEmail } from "../daily-emails/picks.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GITHUB_TOKEN = Deno.env.get("GITHUB_DISPATCH_TOKEN") ?? "";
const REPO = "bhargavamodukuru-glitch/geesling";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function torontoNow(now: Date): { hour: number; day: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(now)
      .map((x) => [x.type, x.value]),
  );
  return { hour: Number(p.hour), day: `${p.year}-${p.month}-${p.day}` };
}

/** Starts a workflow on main. 204 = started. */
async function startWorkflow(file: string): Promise<{ ok: boolean; status: number }> {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${file}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "geesling-email-dispatch" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (!r.ok) console.error("dispatch failed", file, r.status, (await r.text()).slice(0, 200));
  return { ok: r.ok, status: r.status };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!GITHUB_TOKEN) return json({ error: "GITHUB_DISPATCH_TOKEN is not set" }, 500);
  const params = new URL(request.url).searchParams;
  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const now = new Date();

  let job: string;
  let workflow: string;
  let quietSeconds: number;
  if (params.get("welcome") === "1") {
    const { count, error } = await db.from("profiles").select("owner", { count: "exact", head: true }).eq("marketing_opt_in", true).is("welcome_sent_at", null);
    if (error) return json({ error: error.message }, 500);
    if (!count) return json({ skipped: "nobody waiting for a thank-you" });
    job = "welcome";
    workflow = "welcome-emails.yml";
    // A run handles everyone waiting when it starts; sign-ups during a run are picked up by the next call.
    quietSeconds = 60;
  } else if (params.get("daily") === "1") {
    const t = torontoNow(now);
    const kind = dueEmail(t.hour);
    if (!kind) return json({ skipped: "no daily email due now", hour: t.hour });
    const { data: sent, error } = await db.from("email_sends").select("kind").eq("kind", kind).eq("day", t.day).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (sent) return json({ skipped: "already sent today", kind });
    job = `daily-${kind}-${t.day}`;
    workflow = "daily-emails.yml";
    // Give a started run time to finish before starting another (it records the send when done).
    quietSeconds = 15 * 60;
  } else {
    return json({ error: "welcome=1 or daily=1" }, 400);
  }

  // At most one start per job per quiet period, however often this is called.
  const { data: last } = await db.from("email_dispatches").select("at").eq("job", job).maybeSingle();
  if (last && now.getTime() - Date.parse(last.at as string) < quietSeconds * 1000) return json({ skipped: "started recently", job });
  await db.from("email_dispatches").upsert({ job, at: now.toISOString() });
  const started = await startWorkflow(workflow);
  console.log("email dispatch", { job, workflow, ...started });
  return json({ job, workflow, started: started.ok, status: started.status }, started.ok ? 200 : 502);
});
