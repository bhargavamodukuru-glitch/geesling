// Geesling's daily emails as HTML + plain text. Pure (tests/dailyEmails.test.ts).
// Accessibility (WCAG 2.2 AA, as far as email allows): real text (no text in images), lang="en", layout tables marked
// role="presentation", a 16px reading size with 1.5 line height, colours measured at 4.5:1 or better, link text that
// says where it goes, a meaningful alt on the only image, nothing conveyed by colour alone (tags carry words), and a
// plain-text part for clients and readers that prefer it. Look: Geesling's pixel style (chunky borders, hard shadows,
// parchment and ink), with the pixel font only on big headings and Atkinson Hyperlegible for reading text.

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

const C = {
  ink: "#3B2412",
  inkSoft: "#6B4A2E",
  parchment: "#F6E7C1",
  parchmentDark: "#EAD3A0",
  paper: "#FFF8E6",
  red: "#C8412F",
  gold: "#F2C14E",
  green: "#3D7A26",
};
const BODY_FONT = "'Atkinson Hyperlegible', Verdana, Arial, sans-serif";
const PIXEL_FONT = "'Pixelify Sans', 'Courier New', monospace";
export const CONTACT_EMAIL = "geeslingthegoose@outlook.com";
const GOOSE_URL = "https://geesling.ca/goose-192.png";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const TAG_STYLE: Record<TagTone, string> = {
  free: `background:${C.green};color:${C.paper};`,
  price: `background:${C.gold};color:${C.ink};border:1px solid ${C.ink};`,
  extra: `background:${C.parchmentDark};color:${C.ink};border:1px solid ${C.ink};`,
};

function itemHtml(item: EmailItem): string {
  const tag = item.tag
    ? ` <span style="display:inline-block;${TAG_STYLE[item.tag.tone]}font-family:${BODY_FONT};font-size:12px;font-weight:700;line-height:18px;padding:0 6px;vertical-align:1px;">${escapeHtml(item.tag.text)}</span>`
    : "";
  const step = item.step
    ? `<td width="36" valign="top" style="padding:0 10px 0 0;"><div style="width:30px;height:30px;line-height:30px;text-align:center;background:${C.ink};color:${C.gold};font-family:${BODY_FONT};font-size:16px;font-weight:700;">${item.step}</div></td>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;"><tr>${step}<td style="background:${C.paper};border:3px solid ${C.ink};box-shadow:3px 3px 0 ${C.ink};padding:10px 12px;">
<p style="margin:0;font-family:${BODY_FONT};font-size:16px;line-height:1.4;font-weight:700;color:${C.ink};">${escapeHtml(item.title)}${tag}</p>
<p style="margin:2px 0 0;font-family:${BODY_FONT};font-size:15px;line-height:1.5;color:${C.inkSoft};">${escapeHtml(item.detail)}</p>
</td></tr></table>`;
}

export function renderEmail(content: EmailContent, unsubscribeUrl: string): { html: string; text: string } {
  const sections = content.sections
    .map((s) => `${s.heading ? `<h2 style="margin:18px 0 10px;font-family:${PIXEL_FONT};font-size:18px;line-height:1.3;letter-spacing:1px;color:${C.red};">${escapeHtml(s.heading)}</h2>` : ""}${s.items.map(itemHtml).join("")}`)
    .join("");
  const hero = content.hero
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;"><tr><td style="background:${C.red};border:3px solid ${C.ink};box-shadow:4px 4px 0 ${C.ink};padding:14px;">
<h1 style="margin:0;font-family:${PIXEL_FONT};font-size:24px;line-height:1.25;letter-spacing:1px;color:${C.paper};">${escapeHtml(content.hero.title)}</h1>
<p style="margin:4px 0 0;font-family:${BODY_FONT};font-size:15px;line-height:1.5;color:${C.paper};">${escapeHtml(content.hero.subtitle)}</p></td></tr></table>`
    : "";
  const total = content.total
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 12px;"><tr><td style="background:${C.ink};padding:10px 12px;font-family:${BODY_FONT};font-size:16px;line-height:1.4;color:${C.paper};">${escapeHtml(content.total.label)} <strong style="color:${C.gold};font-size:18px;">${escapeHtml(content.total.value)}</strong></td></tr></table>`
    : "";
  const attribution = content.attribution
    ? `<p style="margin:0 0 12px;font-family:${BODY_FONT};font-size:13px;line-height:1.5;color:${C.inkSoft};">${escapeHtml(content.attribution)}</p>`
    : "";

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Pixelify+Sans:wght@700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.parchmentDark};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.parchmentDark};"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.parchment};border:4px solid ${C.ink};box-shadow:6px 6px 0 ${C.ink};">
<tr><td style="background:${C.ink};padding:10px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="44" valign="middle"><img src="${GOOSE_URL}" width="40" height="40" alt="Geesling the goose" style="display:block;image-rendering:pixelated;"></td>
<td valign="middle" style="padding-left:10px;font-family:${PIXEL_FONT};font-size:22px;font-weight:700;letter-spacing:2px;color:${C.gold};">GEESLING</td>
<td align="right" valign="middle" style="font-family:${BODY_FONT};font-size:14px;color:${C.paper};">${escapeHtml(content.dateLabel)}</td>
</tr></table></td></tr>
<tr><td style="padding:18px 16px 6px;">
${hero}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="background:${C.paper};border:3px solid ${C.ink};box-shadow:4px 4px 0 ${C.ink};padding:12px 14px;">
<p style="margin:0 0 4px;font-family:${BODY_FONT};font-size:13px;font-weight:700;letter-spacing:1px;color:${C.red};">GEESLING SAYS</p>
<p style="margin:0;font-family:${BODY_FONT};font-size:17px;line-height:1.5;color:${C.ink};">${escapeHtml(content.intro)}</p>
</td></tr></table>
${sections}
${total}
${attribution}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 16px;"><tr><td style="background:${C.red};border:3px solid ${C.ink};box-shadow:4px 4px 0 ${C.ink};">
<a href="${escapeHtml(content.cta.url)}" style="display:inline-block;padding:11px 18px;font-family:${BODY_FONT};font-size:16px;font-weight:700;color:${C.paper};text-decoration:none;">${escapeHtml(content.cta.label)}</a>
</td></tr></table>
<p style="margin:0 0 18px;font-family:${BODY_FONT};font-size:16px;line-height:1.5;color:${C.ink};">${escapeHtml(content.outro)}</p>
</td></tr>
<tr><td style="background:${C.parchmentDark};border-top:3px solid ${C.ink};padding:12px 16px;font-family:${BODY_FONT};font-size:13px;line-height:1.6;color:${C.inkSoft};">
You're getting this because you ticked "Send me Geesling updates" on geesling.ca. <a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.ink};text-decoration:underline;">Unsubscribe from Geesling emails</a><br>
Any questions or concerns? Email <a href="mailto:${CONTACT_EMAIL}" style="color:${C.ink};text-decoration:underline;">${CONTACT_EMAIL}</a>
</td></tr>
</table>
</td></tr></table>
</body>
</html>`;

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
  lines.push(`${content.cta.label}: ${content.cta.url}`, "", content.outro, "", "—", `You're getting this because you ticked "Send me Geesling updates" on geesling.ca.`, `Unsubscribe: ${unsubscribeUrl}`, `Any questions or concerns? Email ${CONTACT_EMAIL}`);
  return { html, text: lines.join("\n") };
}
