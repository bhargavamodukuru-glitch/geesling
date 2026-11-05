// Geesling's daily emails as HTML + plain text. Pure (tests/dailyEmails.test.ts).
// Look: the same as geesling.ca's "about you" form. Geesling's sky (sun, clouds) above a paper card with a chunky ink
// border and hard shadow, the skyline (CN Tower, trees, grass, lake, the goose) below. Inside the card: the red
// GEESLING label, Pixelify Sans field labels, each suggestion in a white box like the form's inputs, small VT323
// print, and a red Save-style button beside a paper one. The scene is two images on geesling.ca (public/email), drawn
// from the app's own backdrop; everything with words is real text. Fonts: VT323 for text, Pixelify Sans for labels
// (Google Fonts; clients that block web fonts fall back to monospace).
// Accessibility (WCAG 2.2 AA, as far as email allows): lang="en", layout tables marked role="presentation", decorative
// scene images with empty alt, colours at 4.5:1 or better, link text that says where it goes, nothing conveyed by
// colour alone, and a plain-text part for clients and readers that prefer it.

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
const ART = "https://geesling.ca/email";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const TAG_COLOUR: Record<TagTone, string> = { free: C.green, price: C.ink, extra: C.inkSoft };

/**
 * A field label above its box, like "Email" on the form; here the step and the price or FREE. In VT323, not the pixel
 * label font: at this size Pixelify Sans makes 5 and 2 look like 8, and these labels are mostly numbers and prices.
 */
function label(text: string, colour: string = C.ink): string {
  return `<p style="margin:0 0 4px;font-family:${TEXT};font-size:19px;letter-spacing:0.5px;line-height:1.1;color:${colour};">${text}</p>`;
}

/** One suggestion: a label, then a white box like the form's inputs. */
function itemHtml(item: EmailItem): string {
  const parts = [item.step ? `${item.step}.` : "", item.tag ? `<span style="color:${TAG_COLOUR[item.tag.tone]};">${escapeHtml(item.tag.text)}</span>` : ""].filter(Boolean);
  return `${parts.length ? label(parts.join(" ")) : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;"><tr><td style="background:${C.white};border:3px solid ${C.ink};padding:9px 12px;">
<p style="margin:0;font-family:${TEXT};font-size:22px;line-height:1.15;color:${C.ink};">${escapeHtml(item.title)}</p>
<p style="margin:3px 0 0;font-family:${TEXT};font-size:18px;line-height:1.2;color:${C.inkSoft};">${escapeHtml(item.detail)}</p>
</td></tr></table>`;
}

/** A small bordered chip, like the form's age buttons. */
function chip(text: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:2px 0 14px;"><tr><td style="background:${C.paper};border:2px solid ${C.ink};box-shadow:2px 2px 0 ${C.ink};padding:5px 10px;font-family:${TEXT};font-size:19px;line-height:1.2;color:${C.ink};">${text}</td></tr></table>`;
}

export function renderEmail(content: EmailContent, unsubscribeUrl: string): { html: string; text: string } {
  const heading = content.hero
    ? `<h1 style="margin:0 0 4px;font-family:${TEXT};font-size:30px;line-height:1.1;font-weight:400;color:${C.ink};">${escapeHtml(content.hero.title)}</h1>
<p style="margin:0 0 12px;font-family:${TEXT};font-size:18px;line-height:1.25;color:${C.inkSoft};">${escapeHtml(content.hero.subtitle)}</p>
<p style="margin:0 0 16px;font-family:${TEXT};font-size:22px;line-height:1.2;color:${C.ink};">${escapeHtml(content.intro)}</p>`
    : `<h1 style="margin:0 0 16px;font-family:${TEXT};font-size:24px;line-height:1.2;font-weight:400;color:${C.ink};">${escapeHtml(content.intro)}</h1>`;
  const sections = content.sections
    // VT323 here too: headings like "Dinner under $20" carry numbers, which Pixelify Sans blurs at this size.
    .map((s) => `${s.heading ? `<h2 style="margin:18px 0 8px;font-family:${TEXT};font-size:22px;font-weight:400;letter-spacing:1.5px;color:${C.red};">${escapeHtml(s.heading.toUpperCase())}</h2>` : ""}${s.items.map(itemHtml).join("")}`)
    .join("");
  const total = content.total ? chip(`${escapeHtml(content.total.label)} <strong style="color:${C.red};font-weight:400;">${escapeHtml(content.total.value)}</strong>`) : "";
  const small = (text: string) => `<p style="margin:0 0 14px;font-family:${TEXT};font-size:18px;line-height:1.2;color:${C.inkSoft};">${text}</p>`;
  const button = (href: string, text: string, primary: boolean) =>
    `<td style="padding:0 12px 0 0;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${primary ? C.red : C.paper};border:3px solid ${C.ink};box-shadow:${primary ? 4 : 3}px ${primary ? 4 : 3}px 0 ${C.ink};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:9px 16px;font-family:${LABEL};font-size:${primary ? 16 : 14}px;font-weight:700;color:${primary ? C.white : C.ink};text-decoration:none;">${escapeHtml(text)}</a></td></tr></table></td>`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(content.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=VT323&family=Pixelify+Sans:wght@700&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:${C.sky};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(content.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.sky};"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td><img src="${ART}/sky.png" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></td></tr>
<tr><td style="padding:0 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.paper};border:4px solid ${C.ink};box-shadow:6px 6px 0 ${C.ink};"><tr><td style="padding:18px 18px 20px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;"><tr>
<td style="font-family:${LABEL};font-size:13px;font-weight:700;letter-spacing:1.5px;color:${C.red};">GEESLING</td>
<td align="right" style="font-family:${TEXT};font-size:17px;color:${C.inkSoft};">${escapeHtml(content.dateLabel)}</td>
</tr></table>
${heading}
${sections}
${total}
${content.attribution ? small(escapeHtml(content.attribution)) : ""}
${small(escapeHtml(content.outro))}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:4px 0 0;"><tr>
${button(content.cta.url, content.cta.label, true)}
${button("https://geesling.ca/?from=email", "Open the live map", false)}
</tr></table>
</td></tr></table>
</td></tr>
<tr><td style="padding-top:18px;"><img src="${ART}/skyline.png" width="560" alt="" style="display:block;width:100%;max-width:560px;height:auto;border:0;"></td></tr>
<tr><td align="center" style="padding:14px 20px 24px;font-family:${TEXT};font-size:17px;line-height:1.25;color:${C.inkSoft};">
You're getting this because you ticked "Send me Geesling updates" on geesling.ca.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:${C.ink};text-decoration:underline;">Unsubscribe from Geesling emails</a><br>
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
