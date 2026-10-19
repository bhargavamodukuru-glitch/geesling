import type { PlaceItem } from "./types";

/** Curated public photo viewpoints. Coordinates point to the park or viewpoint entrance/area. */
export const PHOTO_SPOTS: PlaceItem[] = [
  {
    kind: "place", id: "photo-riverdale-east", name: "Riverdale Park East Lookout", primary_type: "photography_spot", types: ["photography_spot", "park"],
    address: "550 Broadview Ave, Toronto", lat: 43.6678, lng: -79.3545, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: "https://www.toronto.ca/data/parks/prd/facilities/complex/308/index.html", maps_url: "https://www.google.com/maps/search/?api=1&query=Riverdale+Park+East+Lookout+Toronto",
    summary: "A popular hilltop view across the Don Valley toward the downtown skyline.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-polson-pier", name: "Polson Pier Skyline Viewpoint", primary_type: "photography_spot", types: ["photography_spot", "viewpoint"],
    address: "11 Polson St, Toronto", lat: 43.6395, lng: -79.3538, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: null, maps_url: "https://www.google.com/maps/search/?api=1&query=Polson+Pier+Toronto",
    summary: "Waterfront skyline views, especially around sunset.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-humber-bay-east", name: "Humber Bay Park East", primary_type: "photography_spot", types: ["photography_spot", "park", "waterfront"],
    address: "100 Humber Bay Park Rd W, Toronto", lat: 43.6203, lng: -79.4774, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: null, maps_url: "https://www.google.com/maps/search/?api=1&query=Humber+Bay+Park+East+Toronto",
    summary: "Waterfront paths, wildlife, and broad views toward the Toronto skyline.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-trillium-park", name: "Trillium Park", primary_type: "photography_spot", types: ["photography_spot", "park", "waterfront"],
    address: "955 Lake Shore Blvd W, Toronto", lat: 43.6272, lng: -79.4148, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: null, maps_url: "https://www.google.com/maps/search/?api=1&query=Trillium+Park+Toronto",
    summary: "A waterfront park with skyline, shoreline, and cityscape photo views.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-centre-island-pier", name: "Centre Island Pier", primary_type: "photography_spot", types: ["photography_spot", "viewpoint", "waterfront"],
    address: "Toronto Island Park, Toronto", lat: 43.6205, lng: -79.3783, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: "https://www.toronto.ca/explore-enjoy/toronto-island-ferries/things-to-do-on-toronto-island/", maps_url: "https://www.google.com/maps/search/?api=1&query=Centre+Island+Pier+Toronto",
    summary: "A scenic pier with views over Lake Ontario and the island shoreline.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-scarborough-bluffs", name: "Bluffer’s Park & Beach Viewpoint", primary_type: "photography_spot", types: ["photography_spot", "viewpoint", "park"],
    address: "1 Brimley Rd S, Scarborough", lat: 43.7065, lng: -79.2317, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: "https://www.toronto.ca/explore-enjoy/parks-recreation/places-spaces/parks-and-recreation-facilities/location/?id=2&title=Bluffer%27s-Park-and-Beach", maps_url: "https://www.google.com/maps/search/?api=1&query=Bluffer%27s+Park+Lookout+Toronto",
    summary: "Lake Ontario, beach, and dramatic bluff scenery. Stay in signed public areas and check access before heading out.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-evergreen-brick-works", name: "Evergreen Brick Works Lookout", primary_type: "photography_spot", types: ["photography_spot", "park", "viewpoint"],
    address: "550 Bayview Ave, Toronto", lat: 43.6843, lng: -79.3658, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: "https://evergreen.ca/evergreen-brick-works/", maps_url: "https://www.google.com/maps/search/?api=1&query=Evergreen+Brick+Works+Toronto",
    summary: "Trails, restored industrial buildings, and leafy Don Valley scenery.", open_now: null, hours: null,
  },
  {
    kind: "place", id: "photo-tommy-thompson", name: "Tommy Thompson Park Lookout", primary_type: "photography_spot", types: ["photography_spot", "park", "waterfront"],
    address: "1 Leslie St, Toronto", lat: 43.6201, lng: -79.3294, price_level: null, is_free: true, involves_alcohol: false,
    rating: null, rating_count: null, website: "https://tommythompsonpark.ca/", maps_url: "https://www.google.com/maps/search/?api=1&query=Tommy+Thompson+Park+Floating+Bridge+Toronto",
    summary: "A waterfront wilderness setting with lake, wildlife, and skyline views.", open_now: null, hours: null,
  },
];
