// Unsubscribe from Geesling's emails. Links in every email carry the account id and an HMAC signature (made by
// daily-emails with EMAIL_UNSUB_SECRET), so nobody can unsubscribe someone else.
//   GET  ?u=&t=  → a small page with an "Unsubscribe" button (a link preview or scanner can't unsubscribe anyone)
//   POST ?u=&t=  → unsubscribes: the button above, and Gmail/Yahoo's one-click (List-Unsubscribe-Post, RFC 8058)
// Unsubscribing turns off profiles.marketing_opt_in (emails) and forgets any push subscriptions; the rest of the
// person's details stay unless they ask for deletion. Public (verify_jwt = false in supabase/config.toml).
import { createClient } from "npm:@supabase/supabase-js@2.95.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SECRET = Deno.env.get("EMAIL_UNSUB_SECRET") ?? "";
const CONTACT = "geeslingthegoose@outlook.com";

async function expectedToken(owner: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(owner)));
  return btoa(String.fromCharCode(...sig.slice(0, 18))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Geesling</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Pixelify+Sans:wght@700&display=swap" rel="stylesheet">
<style>
body{margin:0;background:#EAD3A0;font-family:'Atkinson Hyperlegible',Verdana,Arial,sans-serif;color:#3B2412}
main{max-width:480px;margin:48px auto;padding:0 16px}
.card{background:#F6E7C1;border:4px solid #3B2412;box-shadow:6px 6px 0 #3B2412;padding:20px}
h1{font-family:'Pixelify Sans','Courier New',monospace;font-size:24px;margin:0 0 10px;color:#C8412F}
p{font-size:17px;line-height:1.5;margin:0 0 14px}
button{font:700 17px 'Atkinson Hyperlegible',Verdana,sans-serif;background:#C8412F;color:#FFF8E6;border:3px solid #3B2412;box-shadow:4px 4px 0 #3B2412;padding:10px 18px;cursor:pointer}
button:focus-visible,a:focus-visible{outline:3px solid #3B2412;outline-offset:2px;box-shadow:0 0 0 6px #F2C14E}
a{color:#3B2412}
</style></head><body><main><div class="card"><h1>${title}</h1>${body}</div></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const owner = url.searchParams.get("u") ?? "";
  const token = url.searchParams.get("t") ?? "";
  if (owner === "test") return page("This is a test email", `<p>The real emails' unsubscribe link turns off Geesling emails for that person in one click.</p>`);
  if (!SECRET || !UUID.test(owner) || !same(token, await expectedToken(owner))) {
    return page("That link didn't work", `<p>It may be incomplete. To stop Geesling emails, reply to any of them or email <a href="mailto:${CONTACT}">${CONTACT}</a>.</p>`, 400);
  }

  if (request.method === "GET") {
    return page(
      "Unsubscribe from Geesling emails?",
      `<p>You'll stop getting the morning, noon and 5 pm emails, and any Geesling notifications.</p>
<form method="post" action="${url.pathname}?${url.searchParams.toString()}"><button type="submit">Unsubscribe</button></form>`,
    );
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { error } = await db.from("profiles").update({ marketing_opt_in: false, marketing_consent_at: null }).eq("owner", owner);
  if (error) {
    console.error("unsubscribe failed", error.message);
    return page("Something went wrong", `<p>We couldn't unsubscribe you just now. Try again, or email <a href="mailto:${CONTACT}">${CONTACT}</a> and we'll do it by hand.</p>`, 500);
  }
  // Push subscriptions (if that table exists yet) go too.
  await db.from("push_subscriptions").delete().eq("owner", owner);
  console.log("unsubscribed", { owner: owner.slice(0, 8) });
  return page("You're unsubscribed", `<p>Honk. You won't get any more Geesling emails or notifications. Changed your mind? Tick "Send me Geesling updates" on <a href="https://geesling.ca">geesling.ca</a> any time.</p>`);
});
