// Deterministic avatar background colour derived from a name/identifier, the
// same person always gets the same colour (like V2). White text reads on all
// of these (they're mid-to-deep tones).
//
// NOTE: deliberately NO saffron / terracotta / amber / gold here, those are
// the app's primary theme hues, so an avatar landing on them looked like it was
// just using the theme colour. These are vivid, well-separated, cooler tones so
// the colour reads as clearly name-derived and distinct from the brand.
const PALETTE = [
  "#2563eb", // blue
  "#4f46e5", // indigo
  "#7c3aed", // violet
  "#9333ea", // purple
  "#c026d3", // fuchsia
  "#db2777", // pink
  "#e11d48", // rose
  "#0d9488", // teal
  "#0891b2", // cyan
  "#0284c7", // sky
  "#059669", // emerald
  "#16a34a", // green
  "#4d7c0f", // deep lime
  "#475569", // slate
];

export function avatarColor(seed: string): string {
  const key = (seed || "").trim() || "user";
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
