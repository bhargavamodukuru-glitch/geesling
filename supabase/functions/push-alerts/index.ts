// Sends Geesling's morning (8:30 am, daily) and after-work (5 pm, weekdays) heads-ups by web push to people who
// ticked "Send me Geesling updates" and allowed notifications (public.push_recipients()).
// Called by .github/workflows/push-alerts.yml with the service-role key; each alert goes out at most once per
// Toronto day (public.push_sends), so a late or repeated schedule is harmless.
//   POST /functions/v1/push-alerts              → sends whichever alert is due now in Toronto, if any
//   POST /functions/v1/push-alerts?kind=evening → that alert, now (still once a day)
//   ...&dry=1                                   → only says what it would send
import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import webpush from "npm:web-push@3.6.7";
import { composeAlert, dueAlert, type AlertKind, type PushNumbers } from "./messages.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const VAPID_SUBJECT = "https://geesling.ca";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/** Only the service role may call this: the gateway checks the token's signature, this checks its role. */
function isServiceRole(request: Request): boolean {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (token && token === SERVICE_KEY) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

function torontoNow(): { hour: number; weekday: number; day: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", hour: "2-digit", hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday);
  return { hour: Number(parts.hour), weekday, day: `${parts.year}-${parts.month}-${parts.day}` };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "POST only" }, 405);
  if (!isServiceRole(request)) return json({ error: "forbidden" }, 403);
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return json({ error: "VAPID keys are not set" }, 500);

  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  const now = torontoNow();
  const asked = params.get("kind");
  const kind: AlertKind | null = asked === "morning" || asked === "evening" ? asked : dueAlert(now.hour, now.weekday);
  if (!kind) return json({ skipped: "no alert due now", toronto: now });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  // Morning counts the whole day; evening counts 5–11 pm.
  const { data: numbers, error: numbersError } = await db.rpc("push_numbers", kind === "morning" ? { from_hour: 6, to_hour: 24 } : { from_hour: 17, to_hour: 23 });
  if (numbersError) return json({ error: numbersError.message }, 500);
  const message = composeAlert(kind, numbers as PushNumbers, now.weekday);

  const { data: recipients, error: recipientsError } = await db.rpc("push_recipients");
  if (recipientsError) return json({ error: recipientsError.message }, 500);
  const list = (recipients ?? []) as Array<{ endpoint: string; p256dh: string; auth: string }>;
  if (dry) return json({ dry: true, kind, toronto: now, message, recipients: list.length, numbers });

  // Claim today's send first; if it's already claimed, this alert went out earlier today.
  const { data: claimed, error: claimError } = await db.from("push_sends").insert({ kind, day: now.day, title: message.title, body: message.body }).select("kind");
  if (claimError) {
    if (claimError.code === "23505") return json({ skipped: "already sent today", kind, day: now.day });
    return json({ error: claimError.message }, 500);
  }
  if (!claimed?.length) return json({ skipped: "already sent today", kind, day: now.day });

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  const payload = JSON.stringify(message);
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  // A few at a time, so one slow push service doesn't hold up the rest.
  for (let i = 0; i < list.length; i += 20) {
    await Promise.all(
      list.slice(i, i + 20).map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 4 * 3600, urgency: "normal" });
          sent++;
        } catch (e) {
          failed++;
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410: the browser dropped this subscription (uninstalled, cleared, or turned off); forget it.
          if (status === 404 || status === 410) gone.push(s.endpoint);
          else console.warn("push failed", status, String((e as Error).message).slice(0, 200));
        }
      }),
    );
  }
  if (gone.length) await db.from("push_subscriptions").delete().in("endpoint", gone);
  if (sent) await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString() }).in("endpoint", list.map((s) => s.endpoint).filter((e) => !gone.includes(e)));
  await db.from("push_sends").update({ sent, failed }).eq("kind", kind).eq("day", now.day);
  console.log("push alert", { kind, day: now.day, recipients: list.length, sent, failed, removed: gone.length });
  return json({ kind, day: now.day, message, recipients: list.length, sent, failed, removed: gone.length });
});
