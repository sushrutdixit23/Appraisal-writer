// Sentinel — academic-press identity, ported from the companion Python prototype's
// docs/brand.md: "the product is careful reading, citation and a human signature, so it
// should look like a journal that has been checked, not like a control panel."
//
// Parchment paper, ink text, one brand colour (Oxford blue). Oxblood, ochre and green carry
// meaning only (rejected, pending, approved) and are never the only signal - a status word
// is always printed beside them. Gold and faint are decoration (diamond markers, focus
// rings, hairlines) and are never used as text colour.
//
// Chart MARK colours are a separate, smaller set (app/sentinel/lib/viz/tokens.ts): Oxford
// blue fails the data-viz palette validator's lightness/chroma checks on this paper surface
// (it reads as a near-black wash at small sizes, the same reason the sandstone brand colour
// failed before it), so marks keep the already-validated bronze/steel-blue pair. See
// docs/sentinel-viz.md for the validator output.

export const T = {
  background: "#F5F0E4", // paper
  card: "#FBF8F1", // surface: cards, quotes, notes
  ink: "#1D1B16",
  inkSoft: "#585245", // muted
  sidebar: "#ECE4D2", // the table-of-contents rail - light, not a dark glass panel
  sidebarText: "#1D1B16",
  sidebarTextMuted: "#585245",
  accent: "#002147", // oxford: wordmark, headings, primary buttons, active state
  accentStrong: "#0B3566", // oxford-2: hover
  accentSoft: "#E3E8EF", // a light oxford wash for highlighted rows/backgrounds
  rule: "#D2C9B2",
  faint: "#8C8470", // decoration only - rules, borders; never text
  gold: "#A67C1F", // decoration only - diamond markers, focus rings; never text
  slate: "#46597A", // secondary brand accent
  green: "#25593A", // approved / healthy
  ochre: "#7A5200", // pending / watch / caution
  oxblood: "#7A1E2C", // rejected / critical / negative
  concern: "#A14A1E", // a step between watch and critical
  info: "#2D4A78",
  chartPrimary: "#1D1B16",
  chartAccent: "#002147",
} as const;

// Display and figures: an elegant serif with lining numerals, used for the wordmark,
// headings and the big ledger-style figures.
export const SERIF = `"Cormorant Garamond", Georgia, "Times New Roman", serif`;
// Reading text: a sturdier serif for commentary - the AI-drafted and signed-off narrative.
export const READING = `"Source Serif 4", Georgia, "Times New Roman", serif`;
// Labels and controls: quiet contrast to the two serifs, used for small-caps metadata.
export const SANS = `"Source Sans 3", -apple-system, "Segoe UI", sans-serif`;
