// Geesling ingestion: fetch → normalize → de-duplicate across sources → upsert.
// Usage:
//   node ingest/run.ts            # writes to Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   node ingest/run.ts --dry-run  # prints stats and writes ingest-preview.json, touches nothing
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import type { IngestConfig, NormalizedEvent, SourceId, SourceResult } from "./lib/types.ts";
import { dedupe } from "./lib/dedupe.ts";
import { withWebLinks } from "./lib/url.ts";
import { deleteStale, enabledEventbriteOrganizers, finishRun, startRun, storedEvents, upsertEvents, type Db } from "./lib/supabase.ts";
import { fetchToronto } from "./sources/toronto.ts";
import { fetchTicketmaster } from "./sources/ticketmaster.ts";
import { fetchEventbrite } from "./sources/eventbrite.ts";

const TORONTO_FEED =
  "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/9201059e-43ed-4369-885e-0b867652feac/resource/8900fdb2-7f6c-4f50-8581-b463311ff05d/download/file.json";

const dryRun = process.argv.includes("--dry-run");
const env = (name: string): string | null => process.env[name]?.trim() || null;

async function main(): Promise<void> {
  const startedAt = new Date();
  const runId = randomUUID();
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const db: Db | null = supabaseUrl && serviceKey ? { url: supabaseUrl.replace(/\/$/, ""), serviceKey } : null;
  if (!db && !dryRun) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");

  const organizerIds = db
    ? await enabledEventbriteOrganizers(db)
    : (env("EVENTBRITE_ORGANIZER_IDS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  const config: IngestConfig = {
    now: startedAt,
    // Keep the calendar useful for long-range planning, including concerts
    // whose tickets go on sale months before the show.
    horizonDays: Number(env("INGEST_HORIZON_DAYS") ?? 365),
    ticketmasterApiKey: env("TICKETMASTER_API_KEY"),
    eventbriteToken: env("EVENTBRITE_TOKEN"),
    eventbriteOrganizerIds: organizerIds,
    torontoFeedUrl: env("TORONTO_FEED_URL") ?? TORONTO_FEED,
  };

  if (db && !dryRun) await startRun(db, runId, startedAt);

  const jobs: Array<[SourceId, (c: IngestConfig) => Promise<SourceResult>]> = [
    ["toronto", fetchToronto],
    ["ticketmaster", fetchTicketmaster],
    ["eventbrite", fetchEventbrite],
  ];
  const settled = await Promise.allSettled(jobs.map(([, fn]) => fn(config)));

  const fresh: NormalizedEvent[] = [];
  const succeeded: SourceId[] = [];
  const failed: SourceId[] = [];
  const stats: Record<string, unknown> = { runId, dryRun, sources: {} as Record<string, unknown> };
  settled.forEach((result, i) => {
    const source = jobs[i][0];
    if (result.status === "fulfilled") {
      succeeded.push(source);
      fresh.push(...result.value.events.map(withWebLinks));
      (stats.sources as Record<string, unknown>)[source] = {
        ok: true,
        fetched: result.value.fetched,
        normalized: result.value.events.length,
        skipped: result.value.skipped,
      };
    } else {
      failed.push(source);
      (stats.sources as Record<string, unknown>)[source] = { ok: false, error: String(result.reason?.message ?? result.reason) };
    }
  });

  // Rows from sources that failed this run still compete in de-duplication, so a
  // temporary outage never leaves two copies of the same event on the map.
  const carried = db ? await storedEvents(db, failed) : [];
  const { winners, duplicatesRemoved } = dedupe([...fresh, ...carried]);
  stats.carriedFromFailedSources = carried.length;
  stats.duplicatesRemoved = duplicatesRemoved;
  stats.winners = winners.length;
  stats.free = winners.filter((e) => e.is_free).length;
  stats.alcohol = winners.filter((e) => e.involves_alcohol).length;
  stats.rsvp = winners.filter((e) => e.rsvp_required).length;

  if (dryRun || !db) {
    writeFileSync("ingest-preview.json", JSON.stringify(winners.slice(0, 200), null, 2));
    console.log(JSON.stringify(stats, null, 2));
    console.log("Dry run: wrote first 200 events to ingest-preview.json");
    return;
  }

  await upsertEvents(db, winners, runId);
  await deleteStale(db, [...succeeded, ...failed], runId);
  stats.durationMs = Date.now() - startedAt.getTime();
  await finishRun(db, runId, stats);
  console.log(JSON.stringify(stats, null, 2));
  if (succeeded.length === 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
