// Usage report as CSV for Google Sheets' IMPORTDATA.
// GET /functions/v1/usage-report?token=<USAGE_REPORT_TOKEN>&part=summary|daily|walks|top|feedback|costs|comments
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { costRows, type CostReport } from "./costs.ts";

type Row = Array<string | number | null>;

interface Report {
  summary: Record<string, string | number | null>;
  daily: Array<{ day: string; requests: number; walks: number; users: number }>;
  walks: Array<{
    created: string;
    id: string;
    prompt: string;
    title: string;
    stops: number;
    event_stops: number;
    free_stops: number;
    total_minutes: number | null;
    time_budget_minutes: number | null;
    /** "Team" for the owner's devices and test scripts, "User" for everyone else. */
    source: "Team" | "User";
  }>;
  top_stops: Array<{ name: string; kind: string; picks: number }>;
  feedback: Array<{ created: string; rating: number | null; message: string; contact: string | null; platform: string | null; source: "Team" | "User" }>;
}

const RATING_LABEL: Record<number, string> = { 3: "😍 Love it", 2: "🙂 It's okay", 1: "😕 Not great" };

const SITE = "https://geesling.expo.app";

interface CommentRow {
  created: string;
  item_kind: "event" | "place";
  item_id: string;
  event_title: string | null;
  nickname: string;
  body: string;
  report_count: number;
  hidden: boolean;
  source: "Team" | "User";
}

/** CSV cell; neutralises leading = + - @ so user prompts can't become spreadsheet formulas. */
function cell(value: string | number | null): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function csv(rows: Row[]): string {
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

/** Constant-time string comparison for the access token. */
function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

function build(report: Report, part: string): Row[] | null {
  switch (part) {
    case "summary": {
      const s = report.summary;
      return [
        ["Metric", "Value"],
        ["Unique users", s.users],
        ["Real users (excluding team)", s.real_users],
        ["Routes by end users", s.routes_end_users],
        ["Routes by team", s.routes_team],
        ["Saved items", s.saved],
        ["Live & upcoming events", s.events_live],
        ["Last event refresh", s.last_ingest],
        ["Report refreshed", s.refreshed_at],
      ];
    }
    case "daily":
      return [["Date", "Goose requests", "Walks created", "Unique users"], ...report.daily.map((d) => [d.day, d.requests, d.walks, d.users])];
    case "walks":
      return [
        ["Created (Toronto)", "Walk ID", "Prompt", "Walk title", "Stops", "Event stops", "Free stops", "Planned minutes", "Time budget (min)", "Share link", "Source"],
        ...report.walks.map((w) => [
          w.created,
          w.id,
          w.prompt,
          w.title,
          w.stops,
          w.event_stops,
          w.free_stops,
          w.total_minutes,
          w.time_budget_minutes,
          `${SITE}/walk/${w.id}`,
          w.source,
        ]),
      ];
    case "top":
      return [["Stop", "Type", "Times picked"], ...report.top_stops.map((t) => [t.name, t.kind, t.picks])];
    case "feedback":
      return [
        ["Sent (Toronto)", "Rating", "Feedback", "Contact", "Platform", "Source"],
        ...report.feedback.map((f) => [f.created, f.rating ? RATING_LABEL[f.rating] ?? f.rating : null, f.message, f.contact, f.platform, f.source]),
      ];
    default:
      return null;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const expected = Deno.env.get("USAGE_REPORT_TOKEN") ?? "";
  const token = url.searchParams.get("token") ?? "";
  if (!expected || !safeEqual(token, expected)) return new Response("Forbidden\n", { status: 403 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const part = url.searchParams.get("part") ?? "summary";
  if (part === "comments") {
    const REVIEW_AT_REPORTS = 3;
    const { data: comments, error: commentsError } = await db.rpc("comments_report");
    if (commentsError) {
      console.error("comments_report failed", commentsError.message);
      return new Response("Report unavailable\n", { status: 500 });
    }
    const rows: Row[] = [
      ["Posted (Toronto)", "Spot type", "Spot", "Nickname", "Comment", "Reports", "Status", "Source"],
      ...(comments as CommentRow[]).map((c) => [
        c.created,
        c.item_kind === "event" ? "Event" : "Place",
        // Place names aren't stored (Google content); a Maps link by place id opens the spot.
        c.event_title ?? (c.item_kind === "place" && /^ChIJ|^Ei|^Gh/.test(c.item_id) ? `https://www.google.com/maps/place/?q=place_id:${c.item_id}` : c.item_id),
        c.nickname,
        c.body,
        c.report_count,
        // Ordinary reports no longer hide a comment (free accounts); a team member hides it with one Report tap.
        c.hidden ? "Hidden" : c.report_count >= REVIEW_AT_REPORTS ? "Needs review" : "Visible",
        c.source,
      ]),
    ];
    return new Response(csv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
  }

  if (part === "costs") {
    const { data: costs, error: costError } = await db.rpc("cost_report");
    if (costError) {
      console.error("cost_report failed", costError.message);
      return new Response("Report unavailable\n", { status: 500 });
    }
    return new Response(csv(costRows(costs as CostReport)), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const { data, error } = await db.rpc("usage_report");
  if (error) {
    console.error("usage_report failed", error.message);
    return new Response("Report unavailable\n", { status: 500 });
  }
  const rows = build(data as Report, part);
  if (!rows) return new Response("Unknown part. Use summary, daily, walks, top, feedback, costs or comments.\n", { status: 400 });

  return new Response(csv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" },
  });
});
