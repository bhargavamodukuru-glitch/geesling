// Badges for places. Type-only imports, so it runs under plain Node in tests/placeBadges.test.ts.
import type { MapItem } from "./types";

/** "Above 4.5 stars" means strictly more than 4.5. */
export const TOP_RATED_ABOVE = 4.5;
/** A handful of reviews can't earn a star: a single 5.0 would mislead. */
export const TOP_RATED_MIN_REVIEWS = 20;

/** A place with a Google rating above 4.5 from at least 20 reviews. Events never get the star. */
export function isTopRated(item: MapItem): boolean {
  return item.kind === "place" && item.rating !== null && item.rating > TOP_RATED_ABOVE && (item.rating_count ?? 0) >= TOP_RATED_MIN_REVIEWS;
}
