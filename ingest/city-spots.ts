// City of Toronto open data spots → city_spots. Datasets change monthly at most, so this runs once a day.
// Usage:
//   node ingest/city-spots.ts            # writes to Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)
//   node ingest/city-spots.ts --dry-run  # prints counts and writes city-spots-preview.json, touches nothing
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { cafeTo, culturalHotspot, drinkingWater, fallColourBlocks, isFallColourTree, musicVenue, placeOfInterest, publicArt, strollTo, text, point, type CitySpot, type Row, type Tree } from "./lib/citySpots.ts";
import { deleteOldCitySpots, upsertCitySpots, type Db } from "./lib/supabase.ts";

const API = "https://ckan0.cf.opendata.inter.prod-toronto.ca/api/3/action";
const PAGE = 32000;
const dryRun = process.argv.includes("--dry-run");
const env = (name: string): string | null => process.env[name]?.trim() || null;

async function getJson(url: string): Promise<{ result: Record<string, unknown> }> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as { result: Record<string, unknown> };
}

/** The dataset's table on the portal (its first datastore resource). */
async function tableId(dataset: string): Promise<string> {
  const pkg = (await getJson(`${API}/package_show?id=${dataset}`)).result as { resources: Array<{ id: string; datastore_active?: boolean }> };
  const table = pkg.resources.find((r) => r.datastore_active);
  if (!table) throw new Error(`${dataset} has no datastore table`);
  return table.id;
}

/** Every row of a dataset's table, optionally filtered and limited to some fields. */
async function rows(dataset: string, options: { filters?: Record<string, unknown>; fields?: string[] } = {}): Promise<Row[]> {
  const id = await tableId(dataset);
  const out: Row[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const params = new URLSearchParams({ id, limit: String(PAGE), offset: String(offset) });
    if (options.filters) params.set("filters", JSON.stringify(options.filters));
    if (options.fields) params.set("fields", options.fields.join(","));
    const page = (await getJson(`${API}/datastore_search?${params}`)).result as { records: Row[] };
    out.push(...page.records);
    if (page.records.length < PAGE) return out;
  }
}

async function fallColours(): Promise<CitySpot[]> {
  const id = await tableId("street-tree-data");
  const species = ((await getJson(`${API}/datastore_search?${new URLSearchParams({ id, distinct: "true", fields: "COMMON_NAME", limit: "1000" })}`)).result as { records: Row[] }).records
    .map((r) => text(r.COMMON_NAME))
    .filter(isFallColourTree);
  const trees: Tree[] = [];
  for (const row of await rows("street-tree-data", { filters: { COMMON_NAME: species }, fields: ["STREETNAME", "CROSSSTREET1", "COMMON_NAME", "DBH_TRUNK", "geometry"] })) {
    const at = point(row);
    if (at) trees.push({ ...at, street: text(row.STREETNAME), crossStreet: text(row.CROSSSTREET1), species: text(row.COMMON_NAME), trunkCm: Number(row.DBH_TRUNK) || null });
  }
  return fallColourBlocks(trees);
}

const SOURCES: Array<[string, () => Promise<CitySpot[]>]> = [
  ["public-art", async () => (await rows("public-art")).map(publicArt).filter((s): s is CitySpot => s !== null)],
  ["strollto", async () => (await rows("strollto")).map(strollTo).filter((s): s is CitySpot => s !== null)],
  ["cultural-hotspot", async () => (await rows("cultural-hotspot-points-of-interest")).map(culturalHotspot).filter((s): s is CitySpot => s !== null)],
  ["places-of-interest", async () => (await rows("places-of-interest-and-toronto-attractions")).map(placeOfInterest).filter((s): s is CitySpot => s !== null)],
  ["music-venues", async () => (await rows("music-venues-spaces-studios-stores")).map(musicVenue).filter((s): s is CitySpot => s !== null)],
  ["parks-drinking-fountains", async () => (await rows("parks-drinking-fountains")).map(drinkingWater).filter((s): s is CitySpot => s !== null)],
  ["cafeto", async () => (await rows("cafeto-curb-lane-parklet-cafe-locations")).map(cafeTo).filter((s): s is CitySpot => s !== null)],
  ["street-tree-data", fallColours],
];

async function main(): Promise<void> {
  const runId = randomUUID();
  const supabaseUrl = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const db: Db | null = supabaseUrl && serviceKey ? { url: supabaseUrl.replace(/\/$/, ""), serviceKey } : null;
  if (!db && !dryRun) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");

  const settled = await Promise.allSettled(SOURCES.map(([, load]) => load()));
  const ok: string[] = [];
  const all: CitySpot[] = [];
  const stats: Record<string, unknown> = {};
  settled.forEach((result, i) => {
    const source = SOURCES[i][0];
    if (result.status === "fulfilled") {
      // The same spot listed twice in a dataset keeps its first row (ids must be unique in one upsert).
      const unique = [...new Map(result.value.map((s) => [s.id, s])).values()];
      ok.push(source);
      all.push(...unique);
      stats[source] = unique.length;
    } else {
      stats[source] = `failed: ${String(result.reason?.message ?? result.reason)}`;
    }
  });
  console.log(JSON.stringify(stats, null, 2));

  if (dryRun || !db) {
    const sample = [...new Set(all.map((s) => s.kind))].flatMap((kind) => all.filter((s) => s.kind === kind).slice(0, 25));
    writeFileSync("city-spots-preview.json", JSON.stringify(sample, null, 2));
    console.log(`Dry run: ${all.length} spots; wrote up to 25 of each kind to city-spots-preview.json`);
    return;
  }
  await upsertCitySpots(db, all as unknown as Array<Record<string, unknown>>, runId);
  // Only datasets that loaded this run replace their old rows; a failed fetch keeps yesterday's.
  await deleteOldCitySpots(db, ok, runId);
  console.log(`Saved ${all.length} city spots from ${ok.length}/${SOURCES.length} datasets.`);
  if (ok.length < SOURCES.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
