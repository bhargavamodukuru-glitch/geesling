// Minimal PostgREST client (service role) — no dependencies, runs on Node 24.
import type { NormalizedEvent, SourceId } from "./types.ts";

export interface Db {
  url: string;
  serviceKey: string;
}

async function request(db: Db, path: string, init: RequestInit & { prefer?: string } = {}): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
    "Content-Type": "application/json",
  };
  if (init.prefer) headers.Prefer = init.prefer;
  const response = await fetch(`${db.url}/rest/v1/${path}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path} failed: ${response.status} ${await response.text()}`);
  return response;
}

export async function startRun(db: Db, runId: string, startedAt: Date): Promise<void> {
  await request(db, "ingestion_runs", {
    method: "POST",
    body: JSON.stringify({ id: runId, started_at: startedAt.toISOString() }),
    prefer: "return=minimal",
  });
}

export async function finishRun(db: Db, runId: string, stats: Record<string, unknown>): Promise<void> {
  await request(db, `ingestion_runs?id=eq.${runId}`, {
    method: "PATCH",
    body: JSON.stringify({ finished_at: new Date().toISOString(), stats }),
    prefer: "return=minimal",
  });
}

export async function enabledEventbriteOrganizers(db: Db): Promise<string[]> {
  const response = await request(db, "eventbrite_organizers?select=id&enabled=eq.true");
  const rows = (await response.json()) as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

/** Events currently stored for sources whose fetch failed this run, so they still take part in de-duplication. */
export async function storedEvents(db: Db, sources: SourceId[]): Promise<NormalizedEvent[]> {
  if (sources.length === 0) return [];
  const columns = [
    "source", "source_id", "title", "description", "categories", "tags", "url", "image_url", "venue_name",
    "address", "lat", "lng", "is_free", "price_min", "price_max", "currency", "price_note", "rsvp_required",
    "rsvp_note", "ticket_url", "involves_alcohol", "age_min", "accessible", "schedule", "schedule_summary",
    "first_start_at", "last_end_at", "quality_score",
  ].join(",");
  const out: NormalizedEvent[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const response = await request(
      db,
      `events?select=${columns}&source=in.(${sources.join(",")})&last_end_at=gt.${new Date().toISOString()}&order=id`,
      { headers: { Range: `${offset}-${offset + pageSize - 1}` } },
    );
    const rows = (await response.json()) as NormalizedEvent[];
    out.push(...rows.map((r) => ({ ...r, price_min: r.price_min === null ? null : Number(r.price_min), price_max: r.price_max === null ? null : Number(r.price_max) })));
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function upsertEvents(db: Db, events: NormalizedEvent[], runId: string): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < events.length; i += 500) {
    const chunk = events.slice(i, i + 500).map((e) => ({ ...e, run_id: runId, updated_at: now }));
    await request(db, "events?on_conflict=source,source_id", {
      method: "POST",
      body: JSON.stringify(chunk),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

/**
 * Removes rows from sources that fetched successfully this run but were not chosen
 * (gone from the source, ended, or lost de-duplication to a more accurate listing).
 */
export async function deleteStale(db: Db, sources: SourceId[], runId: string): Promise<void> {
  if (sources.length === 0) return;
  await request(db, `events?source=in.(${sources.join(",")})&or=(run_id.is.null,run_id.neq.${runId})`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
  await request(db, "rpc/purge_stale", { method: "POST", body: "{}" });
}

/** Saves city spots for this run (city-spots.ts), 500 at a time. */
export async function upsertCitySpots(db: Db, spots: Array<Record<string, unknown>>, runId: string): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < spots.length; i += 500) {
    const chunk = spots.slice(i, i + 500).map((s) => ({ ...s, run_id: runId, updated_at: now }));
    await request(db, "city_spots?on_conflict=id", {
      method: "POST",
      body: JSON.stringify(chunk),
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  }
}

/** Removes city spots from these sources that this run no longer has (gone from the dataset). */
export async function deleteOldCitySpots(db: Db, sources: string[], runId: string): Promise<void> {
  if (sources.length === 0) return;
  await request(db, `city_spots?source=in.(${sources.join(",")})&or=(run_id.is.null,run_id.neq.${runId})`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}
