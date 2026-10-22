import { FunctionsHttpError } from "@supabase/supabase-js";
import { torontoDateRange, windowRange } from "./format";
import { ensureSession, supabase } from "./supabase";
import type { TravelChoice } from "./planner";
import type { Bounds, ChatMessage, EventFilters, EventItem, MapItem, SavedItem, Walk } from "./types";

type EventRow = Omit<EventItem, "kind">;

function toEvent(row: EventRow): EventItem {
  return {
    ...row,
    kind: "event",
    price_min: row.price_min === null ? null : Number(row.price_min),
    price_max: row.price_max === null ? null : Number(row.price_max),
  };
}

export async function fetchEventsInBounds(bounds: Bounds, filters: EventFilters): Promise<EventItem[]> {
  const { from, to } = filters.date ? torontoDateRange(filters.date) : windowRange(filters.window);
  const { data, error } = await supabase.rpc("events_in_bounds", {
    min_lat: bounds.minLat,
    min_lng: bounds.minLng,
    max_lat: bounds.maxLat,
    max_lng: bounds.maxLng,
    from_ts: from.toISOString(),
    to_ts: to.toISOString(),
    free_only: filters.freeOnly,
    cats: filters.categories.length ? filters.categories : null,
    lim: 400,
  });
  if (error) throw new Error(error.message);
  const events = ((data ?? []) as EventRow[]).map(toEvent);
  return events.filter((event) =>
    new Date(event.next_start) < to && new Date(event.next_end) > from &&
    (!filters.paidOnly || !event.is_free) &&
    (!filters.drinksOnly || event.involves_alcohol) &&
    (!filters.rsvpOnly || event.rsvp_required) &&
    (filters.window !== "now" || event.is_live)
  );
}

export interface GuideInput {
  prompt: string;
  history: ChatMessage[];
  origin: { lat: number; lng: number } | null;
  timeBudgetMinutes: number | null;
  startAt: string | null;
  freeOnly: boolean;
  travel?: TravelChoice;
  budgetLimit?: number | null;
  partySize?: number;
}

export interface GuideReply {
  message: string;
  walk: Walk | null;
}

export async function askGeesling(input: GuideInput): Promise<GuideReply> {
  await ensureSession();
  const { data, error } = await supabase.functions.invoke<GuideReply>("geesling", {
    body: {
      prompt: input.prompt,
      history: input.history.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.walk ? `${m.walk.title}: ${m.walk.stops.map((s) => (s.item.kind === "event" ? s.item.title : s.item.name)).join(", ")}` : m.text })),
      origin: input.origin,
      timeBudgetMinutes: input.timeBudgetMinutes,
      startAt: input.startAt,
      freeOnly: input.freeOnly,
      travel: input.travel,
      budgetLimit: input.budgetLimit ?? null,
      partySize: input.partySize ?? 1,
    },
  });
  if (error) {
    // The function answers rate limits and upstream errors with a goose-voiced message.
    if (error instanceof FunctionsHttpError) {
      const response = error.context as Response;
      const body = (await response.json().catch(() => null)) as (Partial<GuideReply> & { error?: string }) | null;
      if (body?.message) return { message: body.message, walk: null };
      throw new Error(body?.error ?? error.message);
    }
    throw new Error(error.message);
  }
  if (!data) throw new Error("Geesling didn't answer");
  return data;
}

/** Opens a walk by its share-link id. Walks can't be listed; the id is the key. */
export async function fetchWalk(id: string): Promise<Walk | null> {
  const { data, error } = await supabase.rpc("get_walk", { walk_id: id });
  if (error) throw new Error(error.message);
  return (data as Walk | null) ?? null;
}

export async function fetchSaved(): Promise<SavedItem[]> {
  await ensureSession();
  const { data, error } = await supabase.from("saved_items").select("kind,item_id,snapshot,created_at").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SavedItem[];
}

export async function saveItem(kind: SavedItem["kind"], itemId: string, snapshot: MapItem | Walk): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("saved_items").upsert({ kind, item_id: itemId, snapshot });
  if (error) throw new Error(error.message);
}

export async function unsaveItem(kind: SavedItem["kind"], itemId: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("saved_items").delete().eq("kind", kind).eq("item_id", itemId);
  if (error) throw new Error(error.message);
}

export type FeedbackRating = 1 | 2 | 3;

/** Sends beta feedback. People can add feedback but not read it back; it reaches the team's Google Sheet. */
export async function sendFeedback(input: { rating: FeedbackRating | null; message: string; contact: string | null; platform: string }): Promise<void> {
  await ensureSession();
  const { error } = await supabase.from("feedback").insert({
    rating: input.rating,
    message: input.message.trim().slice(0, 2000),
    contact: input.contact?.trim().slice(0, 200) || null,
    platform: input.platform.slice(0, 40),
  });
  if (error) {
    // The row-level policy allows 5 an hour per person.
    throw new Error(error.code === "42501" ? "That's a lot of feedback in one hour, thank you! Try again a bit later." : "Couldn't send that just now. Try again?");
  }
}

/** Counts one Google "Dynamic Maps" load for the Costs tab. Fire and forget: a failed count never affects the map. */
export function logMapLoad(): void {
  void supabase.rpc("log_map_load").then(({ error }) => {
    if (error) console.warn("map load not counted", error.message);
  });
}

/** Marks this device's account as team when `code` is the private team code, so the usage sheet highlights it. */
export async function joinTeam(code: string): Promise<boolean> {
  await ensureSession();
  const { data, error } = await supabase.rpc("join_team", { code: code.trim().slice(0, 100) });
  if (error) throw new Error(error.message);
  return data === true;
}

export interface SpotComment {
  id: number;
  nickname: string;
  body: string;
  created_at: string;
  /** Written by this device's account, so it can be deleted. */
  mine: boolean;
}

/** Visible comments on a spot, newest first. */
export async function fetchComments(kind: MapItem["kind"], itemId: string): Promise<SpotComment[]> {
  await ensureSession();
  const { data, error } = await supabase.rpc("spot_comments_for", { p_kind: kind, p_item_id: itemId });
  if (error) throw new Error("Couldn't load comments.");
  return (data ?? []) as SpotComment[];
}

/** Posts a comment. The server's message (too long, links, too many this hour) comes back as the error. */
export async function postComment(kind: MapItem["kind"], itemId: string, nickname: string, body: string): Promise<void> {
  await ensureSession();
  const { error } = await supabase.rpc("add_spot_comment", { p_kind: kind, p_item_id: itemId, p_nickname: nickname, p_body: body });
  if (error) throw new Error(error.message || "Couldn't post that. Try again?");
}

/** Reports a comment; enough reports (or one from the team) hide it. */
export async function reportComment(id: number): Promise<void> {
  await ensureSession();
  const { error } = await supabase.rpc("report_comment", { p_comment_id: id });
  if (error) throw new Error("Couldn't send that report.");
}

export async function deleteComment(id: number): Promise<void> {
  await ensureSession();
  const { error } = await supabase.rpc("delete_my_comment", { p_comment_id: id });
  if (error) throw new Error("Couldn't delete that.");
}
