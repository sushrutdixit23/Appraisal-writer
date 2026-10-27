// Sentinel viz - colour and motion tokens for data marks. Pure (no React), so the server and the tests can read it.
//
// Two jobs, two sets. The BRAND set (theme.ts: black, sandstone) is for chrome: buttons, nav, rules. DATA colours
// are chosen by what the mark means and were run through the dataviz validator (lightness band, chroma floor,
// colour-blind separation, contrast against the white card). The brand sandstone (#A47551) does NOT pass the chroma
// floor (it reads as grey), so marks use a slightly richer bronze instead.
//
//   subject    the company you are looking at (slot 1: bronze)            everything else is context
//   secondary  the second series when a chart truly has two (steel blue)
//   context    peers, "other", the de-emphasised: neutral greys
//   favorable / unfavorable   polarity of a CHANGE. Blue and orange, never green and red: red-green is the one
//              pair a colour-blind reader cannot split, and a delta always carries an arrow and a sign as well.
//
// Validated on #FFFFFF (the card surface), light mode:
//   #B0652B,#2B6CB0   CVD (protan) dE 20.4, normal-vision dE 25.0, contrast >= 3:1, chroma >= 0.10
//   #2B6CB0,#C2571A   CVD (protan) dE 21.5, normal-vision dE 27.8, contrast >= 3:1, chroma >= 0.10

export const VIZ = {
  surface: "#FFFFFF",
  subject: "#B0652B",
  secondary: "#2B6CB0",
  context: "#BDB6A8",
  contextLine: "#8F897D",
  ink: "#161616",
  total: "#161616",
  favorable: "#2B6CB0",
  unfavorable: "#C2571A",
  // The same two hues, darkened for small TEXT (a chip's figures): text never wears the mark colour, it wears
  // a step that clears 4.5:1 on white.
  favorableText: "#1F5C99",
  unfavorableText: "#A94512",
  // The pale ground behind a delta chip. The chip text must clear 4.5:1 on it (checked in the tests).
  favorableWash: "#EAF1F9",
  unfavorableWash: "#FBEEE6",
  neutralWash: "#F3EFE7",
  grid: "#ECE6DA",
  axis: "#CFC7B6",
  textSoft: "#6B6660",
  wash: "#FBF8F2",
} as const;

export const MOTION = {
  /** Gentle deceleration: things arrive and settle, they do not bounce. */
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
  fast: 0.18,
  base: 0.45,
  draw: 0.9,
  stagger: 0.045,
  spring: { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.8 },
};
