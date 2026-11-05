// Sends whichever daily email is due, with its card as a picture so Gmail and Outlook show Geesling's real fonts.
// Run by .github/workflows/daily-emails.yml (needs Playwright's Chromium: `npx playwright install --with-deps chromium`).
//   1. asks supabase/functions/daily-emails for the page to photograph (?page=1) and the content behind it
//   2. photographs that page in headless Chrome, 600px wide at 2x, once the fonts have loaded
//   3. uploads the PNG to the public "email-art" storage bucket (created on first use)
//   4. asks the function to send, with the content and the picture's address
// If any of 1–3 fails, it asks the function to send the all-text version, so a send is never missed. The function's
// idempotency keys stop the same email from going out twice in a day either way.
// Usage: node scripts/render-email.mjs [--kind=morning|neighbourhood|evening] [--test]   (test = owner only)
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { chromium } from "playwright";

const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!base || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}`));
const kind = arg("kind")?.split("=")[1];
const query = [kind ? `kind=${kind}` : "", arg("test") ? "test=1" : ""].filter(Boolean).join("&");
const auth = { Authorization: `Bearer ${key}`, apikey: key };
const BUCKET = "email-art";

async function fn(extra, body = {}) {
  const q = [query, extra].filter(Boolean).join("&");
  const r = await fetch(`${base}/functions/v1/daily-emails${q ? `?${q}` : ""}`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`daily-emails ${r.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

async function ensureBucket() {
  const r = await fetch(`${base}/storage/v1/bucket`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: 5 * 1024 * 1024, allowed_mime_types: ["image/png"] }),
  });
  // 200 = created; 400/409 "already exists" is fine.
  if (!r.ok && !/exist/i.test(await r.text())) throw new Error(`creating the ${BUCKET} bucket failed: ${r.status}`);
}

async function snapshot(html) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 600, height: 900 }, deviceScaleFactor: 2 });
    await page.setContent(html, { waitUntil: "networkidle", timeout: 45_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Make sure both pixel fonts actually loaded (a fallback font would defeat the point).
      for (const f of ["20px VT323", "700 16px 'Pixelify Sans'"]) await document.fonts.load(f);
    });
    const ok = await page.evaluate(() => document.fonts.check("20px VT323") && document.fonts.check("700 16px 'Pixelify Sans'"));
    if (!ok) throw new Error("web fonts didn't load");
    await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 15_000 });
    return await page.locator("#snapshot").screenshot({ type: "png" });
  } finally {
    await browser.close();
  }
}

async function upload(png, name) {
  const r = await fetch(`${base}/storage/v1/object/${BUCKET}/${name}`, { method: "POST", headers: { ...auth, "Content-Type": "image/png", "x-upsert": "true", "Cache-Control": "max-age=31536000" }, body: png });
  if (!r.ok) throw new Error(`upload failed: ${r.status} ${(await r.text()).slice(0, 200)}`);
  return `${base}/storage/v1/object/public/${BUCKET}/${name}`;
}

const due = await fn("page=1");
if (due.skipped) {
  console.log("nothing to send:", due.skipped);
  process.exit(0);
}
let result;
try {
  const png = await snapshot(due.page);
  await ensureBucket();
  // A new name each send, so inboxes that cache images never show an old card.
  const picture = await upload(png, `${due.day}-${due.kind}-${Date.now()}.png`);
  console.log("picture:", picture, `${Math.round(png.length / 1024)} KB`);
  result = await fn(`kind=${due.kind}`, { content: due.content, picture });
} catch (e) {
  console.error("picture failed, sending the text version:", e.message);
  result = await fn(`kind=${due.kind}`);
}
console.log(JSON.stringify({ kind: result.kind, day: result.day, test: result.test, picture: result.picture, subject: result.subject, recipients: result.recipients, sent: result.sent, failures: result.failures }));
if (result.failures?.length) process.exitCode = 1;
