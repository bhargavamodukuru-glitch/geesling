// Stardew-inspired Google Maps style (warm parchment land, teal water, soft greens).
// Used directly on Android; for web paste it into a Cloud map style and set EXPO_PUBLIC_GOOGLE_MAPS_MAP_ID.
export const STARDEW_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#efd9a7" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#5b3a1e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#fbf1d7" }, { weight: 3 }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#8b5a2b" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e6cf98" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#e2c88e" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#9bcb6b" }] },
  { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#3d7a26" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#fbf1d7" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#c9a96b" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#f2c14e" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#a5772f" }] },
  { featureType: "road.arterial", elementType: "labels.text.fill", stylers: [{ color: "#6b4a2e" }] },
  { featureType: "transit.line", elementType: "geometry", stylers: [{ color: "#c8412f" }, { weight: 1.5 }] },
  { featureType: "transit.station", elementType: "labels.icon", stylers: [{ saturation: -30 }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#6fb7d9" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1e4f6b" }] },
];
