// Geesling's daily emails. Pure (tests/dailyEmails.test.ts).
// Look: geesling.ca's "about you" form. Geesling's sky (sun, clouds) above a paper card with a chunky ink border and
// hard shadow, the skyline (CN Tower, trees, grass, lake, the goose) below. Inside the card: the red GEESLING tag, each
// suggestion as a label above a white input-style box, small print, a red Save-style button and a paper one.
//
// Gmail and Outlook don't load web fonts, so live text can't show VT323 / Pixelify Sans. The card is therefore sent as
// a picture: renderSnapshotPage() is the exact page (web fonts, shadows), which scripts/render-email.mjs photographs in
// headless Chrome at 600px wide and 2x; renderPictureEmail() shows that picture (linked to the main button) with real,
// tappable links, footer and a full text description below/behind it. renderEmail() is the all-text version, used if
// the snapshot fails so a send is never missed.
//
// Sizes: emails are 600px wide (Gmail on a laptop shows them at that width). On a phone the picture shrinks to the
// screen (~60%), so the picture's text sizes are set larger to stay readable there.
// Accessibility: lang="en", layout tables role="presentation", the picture's alt text carries everything in it, the
// links are real text, colours at 4.5:1 or better, and a plain-text part.

export type TagTone = "free" | "price" | "extra";

export interface EmailItem {
  title: string;
  /** Where and when, e.g. "The Image Centre · until 6 pm". */
  detail: string;
  tag?: { text: string; tone: TagTone };
  /** Shown as a numbered step (neighbourhood day). */
  step?: number;
}

export interface EmailSection {
  heading?: string;
  items: EmailItem[];
}

export interface EmailContent {
  /** "Thu · Nov 5 · 9 AM" */
  dateLabel: string;
  subject: string;
  /** The inbox preview line. */
  preheader: string;
  /** Big banner, e.g. "A day in Roncesvalles" (neighbourhood email). */
  hero?: { title: string; subtitle: string };
  intro: string;
  sections: EmailSection[];
  total?: { label: string; value: string };
  attribution?: string;
  cta: { label: string; url: string };
  outro: string;
}

// The form's colours (src/lib/theme.ts).
const C = {
  ink: "#3B2412",
  inkSoft: "#6B4A2E",
  sky: "#F6E7C1",
  paper: "#FFF8E6",
  white: "#FFFFFF",
  red: "#C8412F",
  green: "#3D7A26",
};
const TEXT = "'VT323', 'Courier New', monospace";
const LABEL = "'Pixelify Sans', 'Courier New', monospace";
export const CONTACT_EMAIL = "geeslingthegoose@outlook.com";
const ART = "https://geesling.ca"; // email-sky.png and email-skyline.png sit at the top level (Expo hosting doesn't serve public/ subfolders)
const MAP_URL = "https://geesling.ca/?from=email";
export const EMAIL_WIDTH = 600;

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Text sizes (px) for one way of showing the card. */
interface Sizes {
  tag: number;
  date: number;
  heroTitle: number;
  heroSub: number;
  intro: number;
  heading: number;
  label: number;
  title: number;
  detail: number;
  small: number;
  chip: number;
  button: number;
  button2: number;
}
// Live text in an email (Courier in Gmail): as before.
const TEXT_SIZES: Sizes = { tag: 13, date: 17, heroTitle: 30, heroSub: 18, intro: 24, heading: 22, label: 19, title: 22, detail: 18, small: 18, chip: 19, button: 16, button2: 14 };
// The picture: about a third larger, so on a phone (picture shrunk to ~60%) titles are ~17px and details ~14px.
const PICTURE_SIZES: Sizes = { tag: 17, date: 22, heroTitle: 40, heroSub: 24, intro: 31, heading: 29, label: 25, title: 30, detail: 24, small: 23, chip: 25, button: 21, button2: 18 };

const TAG_COLOUR: Record<TagTone, string> = { free: C.green, price: C.ink, extra: C.inkSoft };

/** The paper card: GEESLING tag, heading, suggestions, total, small print, buttons. */
function cardHtml(content: EmailContent, z: Sizes): string {
  // Labels, prices and section titles are in VT323: at these sizes Pixelify Sans makes 2 and 5 look like 8.
  const label = (text: string) => `<p style="margin:0 0 4px;font-family:${TEXT};font-size:${z.label}px;letter-spacing:0.5px;line-height:1.1;color:${C.ink};">${text}</p>`;
  const item = (it: EmailItem) => {
    const parts = [it.step ? `${it.step}.` : "", it.tag ? `<span style="color:${TAG_COLOUR[it.tag.tone]};">${escapeHtml(it.tag.text)}</span>` : ""].filter(Boolean);
    return `${parts.length ? label(parts.join(" ")) : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="background:${C.white};border:3px solid ${C.ink};padding:10px 13px;">
<p style="margin:0;font-family:${TEXT};font-size:${z.title}px;line-height:1.15;color:${C.ink};">${escapeHtml(it.title)}</p>
<p style="margin:3px 0 0;font-family:${TEXT};font-size:${z.detail}px;line-height:1.2;color:${C.inkSoft};">${escapeHtml(it.detail)}</p>
</td></tr></table>`;
  };
  const heading = content.hero
    ? `<h1 style="margin:0 0 4px;font-family:${TEXT};font-size:${z.heroTitle}px;line-height:1.1;font-weight:400;color:${C.ink};">${escapeHtml(content.hero.title)}</h1>
<p style="margin:0 0 12px;font-family:${TEXT};font-size:${z.heroSub}px;line-height:1.25;color:${C.inkSoft};">${escapeHtml(content.hero.subtitle)}</p>
<p style="margin:0 0 16px;font-family:${TEXT};font-size:${z.intro - 2}px;line-height:1.2;color:${C.ink};">${escapeHtml(content.intro)}</p>`
    : `<h1 style="margin:0 0 16px;font-family:${TEXT};font-size:${z.intro}px;line-height:1.2;font-weight:400;color:${C.ink};">${escapeHtml(content.intro)}</h1>`;
  const sections = content.sections
    .map((s) => `${s.heading ? `<h2 style="margin:18px 0 8px;font-family:${TEXT};font-size:${z.heading}px;font-weight:400;letter-spacing:1.5px;color:${C.red};">${escapeHtml(s.heading.toUpperCase())}</h2>` : ""}${s.items.map(item).join("")}`)
    .join("");
  const total = content.total
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 14px;"><tr><td style="background:${C.paper};border:2px solid ${C.ink};box-shadow:2px 2px 0 ${C.ink};padding:5px 10px;font-family:${TEXT};font-size:${z.chip}px;line-height:1.2;color:${C.ink};">${escapeHtml(content.total.label)} <span style="color:${C.red};">${escapeHtml(content.total.value)}</span></td></tr></table>`
    : "";
  const small = (text: string) => `<p style="margin:0 0 14px;font-family:${TEXT};font-size:${z.small}px;line-height:1.2;color:${C.inkSoft};">${escapeHtml(text)}</p>`;
  // One button per line, text on one line: long names ("Plan my Distillery District day") don't squeeze the other.
  const button = (href: string, text: string, primary: boolean) =>
    `<tr><td style="padding:0 0 ${primary ? 14 : 0}px;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${primary ? C.red : C.paper};border:3px solid ${C.ink};box-shadow:${primary ? 4 : 3}px ${primary ? 4 : 3}px 0 ${C.ink};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:9px 16px;font-family:${LABEL};font-size:${primary ? z.button : z.button2}px;font-weight:700;color:${primary ? C.white : C.ink};text-decoration:none;white-space:nowrap;">${escapeHtml(text)}</a></td></tr></table></td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border:4px solid ${C.ink};box-shadow:6px 6px 0 ${C.ink};"><tr><td style="padding:20px 20px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
<td style="font-family:${LABEL};font-size:${z.tag}px;font-weight:700;letter-spacing:1.5px;color:${C.red};">GEESLING</td>
<td align="right" style="font-family:${TEXT};font-size:${z.date}px;color:${C.inkSoft};">${escapeHtml(content.dateLabel)}</td>
</tr></table>
${heading}
${sections}
${total}
${content.attribution ? small(content.attribution) : ""}
${small(content.outro)}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0;">
${button(content.cta.url, content.cta.label, true)}
${button(MAP_URL, "Open the live map", false)}
</table>
</td></tr></table>`;
}

const head = (title: string) => `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(title)}</title>
<link href="https://fonts.googleapis.com/css2?family=VT323&family=Pixelify+Sans:wght@700&display=swap" rel="stylesheet">
</head>`;

const sceneImg = (file: string) => `<img src="${ART}/${file}" width="${EMAIL_WIDTH}" alt="" style="display:block;width:100%;max-width:${EMAIL_WIDTH}px;height:auto;border:0;">`;

/** Sky, card, skyline: the part that becomes the picture (or, in the text version, live HTML). */
function sceneHtml(content: EmailContent, z: Sizes): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${EMAIL_WIDTH}px;background:${C.sky};">
<tr><td>${sceneImg("email-sky.png")}</td></tr>
<tr><td style="padding:0 18px;">${cardHtml(content, z)}</td></tr>
<tr><td style="padding-top:20px;">${sceneImg("email-skyline.png")}</td></tr>
</table>`;
}

function footerHtml(unsubscribeUrl: string): string {
  return `<tr><td align="center" style="padding:14px 20px 26px;font-family:${TEXT};font-size:17px;line-height:1.3;color:${C.inkSoft};">
You're getting this because you ticked "Send me Geesling updates" on <a href="https://geesling.ca" style="color:${C.ink};text-decoration:underline;">geesling.ca</a>.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.ink};text-decoration:underline;">Unsubscribe from Geesling emails</a><br>
Any questions or concerns? Email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};text-decoration:underline;">${CONTACT_EMAIL}</a>
</td></tr>`;
}

function plainText(content: EmailContent, unsubscribeUrl: string): string {
  const lines: string[] = [`GEESLING · ${content.dateLabel}`, ""];
  if (content.hero) lines.push(content.hero.title.toUpperCase(), content.hero.subtitle, "");
  lines.push(content.intro, "");
  for (const s of content.sections) {
    if (s.heading) lines.push(s.heading.toUpperCase());
    for (const item of s.items) {
      const tag = item.tag ? ` [${item.tag.text}]` : "";
      lines.push(`${item.step ? `${item.step}. ` : "- "}${item.title}${tag}`, `  ${item.detail}`);
    }
    lines.push("");
  }
  if (content.total) lines.push(`${content.total.label} ${content.total.value}`, "");
  if (content.attribution) lines.push(content.attribution, "");
  lines.push(`${content.cta.label}: ${content.cta.url}`, `Open the live map: ${MAP_URL}`, "", content.outro, "", "—", `You're getting this because you ticked "Send me Geesling updates" on geesling.ca.`, `Unsubscribe: ${unsubscribeUrl}`, `Any questions or concerns? Email ${CONTACT_EMAIL}`);
  return lines.join("\n");
}

/** Everything the picture shows, as one description for screen readers and image-blocking inboxes. */
export function altText(content: EmailContent): string {
  const parts = [`Geesling, ${content.dateLabel}.`];
  if (content.hero) parts.push(`${content.hero.title}. ${content.hero.subtitle}.`);
  parts.push(content.intro);
  for (const s of content.sections) {
    if (s.heading) parts.push(`${s.heading}:`);
    for (const it of s.items) parts.push(`${it.step ? `${it.step}. ` : ""}${it.title}${it.tag ? ` (${it.tag.text})` : ""}, ${it.detail}.`);
  }
  if (content.total) parts.push(`${content.total.label} ${content.total.value}.`);
  return parts.join(" ");
}

/** The exact page that gets photographed: web fonts and shadows, 600px wide, nothing else on it. */
export function renderSnapshotPage(content: EmailContent): string {
  return `${head(content.subject)}
<body style="margin:0;padding:0;background:${C.sky};">
<div id="snapshot" style="width:${EMAIL_WIDTH}px;background:${C.sky};">
${sceneHtml(content, PICTURE_SIZES)}
</div>
</body>
</html>`;
}

/**
 * The email with the card as a picture, linked to the main button (the buttons are in the picture; the plain-text
 * part and the alt text carry the links too), then the footer.
 */
export function renderPictureEmail(content: EmailContent, imageUrl: string, unsubscribeUrl: string): { html: string; text: string } {
  const html = `${head(content.subject)}
<body style="margin:0;padding:0;background:${C.sky};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sky};"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${EMAIL_WIDTH}px;">
<tr><td><a href="${escapeHtml(content.cta.url)}" style="display:block;text-decoration:none;"><img src="${escapeHtml(imageUrl)}" width="${EMAIL_WIDTH}" alt="${escapeHtml(altText(content))}" style="display:block;width:100%;max-width:${EMAIL_WIDTH}px;height:auto;border:0;color:${C.ink};font-family:${TEXT};font-size:16px;"></a></td></tr>
${footerHtml(unsubscribeUrl)}
</table>
</td></tr></table>
</body>
</html>`;
  return { html, text: plainText(content, unsubscribeUrl) };
}

/** The all-text email (live HTML card), used if the snapshot can't be made. */
export function renderEmail(content: EmailContent, unsubscribeUrl: string): { html: string; text: string } {
  const html = `${head(content.subject)}
<body style="margin:0;padding:0;background:${C.sky};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sky};"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:${EMAIL_WIDTH}px;">
<tr><td>${sceneHtml(content, TEXT_SIZES)}</td></tr>
${footerHtml(unsubscribeUrl)}
</table>
</td></tr></table>
</body>
</html>`;
  return { html, text: plainText(content, unsubscribeUrl) };
}
